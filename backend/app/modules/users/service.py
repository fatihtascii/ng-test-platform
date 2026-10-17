"""
Users service.

DÜZELTMELER:
- change_password fonksiyonu eklendi — router'daki yeni endpoint için.
- Brute-force koruması in-memory dict kullanıyor; process yeniden başlatıldığında
  sıfırlanır. Production için Redis tabanlı çözüm önerilir (not olarak eklendi).
"""
import re
import logging
import bcrypt
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from fastapi import HTTPException, status

from . import models, schemas

logger = logging.getLogger("ng-test.users")

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,50}$")

# NOT: Production ortamında bu dict Redis ile değiştirilmeli.
# Mevcut haliyle process restart'ta sıfırlanır.
_login_attempts: dict[str, list[datetime]] = {}
MAX_ATTEMPTS = 5
LOCKOUT_SECS = 300


# ── GÜVENLİK YARDIMCILARI ─────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def validate_username(username: str):
    if not _USERNAME_RE.match(username):
        raise HTTPException(
            status_code=400,
            detail="Kullanıcı adı geçersiz. Sadece harf, rakam, _ ve - kullanılabilir.",
        )


def validate_password_strength(password: str):
    if (
        len(password) < 8
        or not any(c.isupper() for c in password)
        or not any(c.isdigit() for c in password)
    ):
        raise HTTPException(
            status_code=400,
            detail="Şifre en az 8 karakter, 1 büyük harf ve 1 rakam içermelidir.",
        )


def check_rate_limit(identifier: str):
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=LOCKOUT_SECS)
    attempts = [t for t in _login_attempts.get(identifier, []) if t > window_start]
    _login_attempts[identifier] = attempts
    if len(attempts) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Çok fazla başarısız giriş denemesi. 5 dakika bekleyin.",
        )


def _assert_role_exists(db: Session, role: str):
    from app.modules.roles.models import Role
    if not db.query(Role).filter(Role.name == role).first():
        raise HTTPException(status_code=400, detail=f"Geçersiz rol: {role}")


def _admin_count(db: Session) -> int:
    return db.query(models.User).filter(models.User.role == "admin").count()


# ── CRUD & AUTH ────────────────────────────────────────────────────

def create_user(db: Session, user: schemas.UserCreate, is_external: bool = False):
    validate_username(user.username)
    validate_password_strength(user.password)

    # E-posta boşsa (None) "email IS NULL" ile diğer e-postasız kullanıcılarla eşleşmesin
    # Büyük/küçük harf duyarsız: "Fatih" ve "fatih" aynı kullanıcı sayılır
    conditions = [func.lower(models.User.username) == user.username.lower()]
    if user.email:
        conditions.append(func.lower(models.User.email) == user.email.lower())
    existing = db.query(models.User).filter(or_(*conditions)).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="E-posta veya kullanıcı adı zaten kullanımda.",
        )

    role = "viewer" if is_external else (user.role or "viewer")
    if not is_external:
        _assert_role_exists(db, role)

    new_user = models.User(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        hashed_password=hash_password(user.password),
        role=role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def authenticate_user(db: Session, user_data: schemas.UserLogin):
    identifier = user_data.identifier.lower().strip()
    check_rate_limit(identifier)

    # identifier küçük harfe çevrildiği için DB tarafı da lower() ile karşılaştırılır
    # (eskiden büyük harfli kullanıcı adları hiç giriş yapamıyordu)
    db_user = db.query(models.User).filter(
        or_(
            func.lower(models.User.username) == identifier,
            func.lower(models.User.email)    == identifier,
        )
    ).first()

    # Timing-safe: gerçek hash yoksa dummy hash kullan
    dummy_hash = "$2b$12$KIX7x5jXiINEKsLPOJ/HZuF1pZ5VqGz3xJSXYcgqQgQw6ZcFzBn5O"
    password_ok = verify_password(
        user_data.password,
        db_user.hashed_password if db_user else dummy_hash,
    )

    if not db_user or not password_ok:
        _login_attempts.setdefault(identifier, []).append(datetime.utcnow())
        raise HTTPException(
            status_code=401,
            detail="Kullanıcı adı, e-posta veya şifre hatalı.",
        )

    _login_attempts.pop(identifier, None)
    return db_user


def get_users(db: Session):
    return db.query(models.User).all()


def get_user_by_id(db: Session, user_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    return user


def update_user(db: Session, user_id: int, user_data: schemas.UserUpdate, actor=None):
    user = get_user_by_id(db, user_id)

    if user_data.role is not None and user_data.role != user.role:
        _assert_role_exists(db, user_data.role)
        # Admin rolünü yalnızca admin verebilir / alabilir
        if (user_data.role == "admin" or user.role == "admin") and (actor is None or actor.role != "admin"):
            raise HTTPException(status_code=403, detail="Admin rolünü yalnızca admin değiştirebilir.")
        if user.role == "admin" and _admin_count(db) <= 1:
            raise HTTPException(status_code=400, detail="Son admin kullanıcısının rolü değiştirilemez.")

    if user_data.email and user_data.email.lower() != (user.email or "").lower():
        if db.query(models.User).filter(
            func.lower(models.User.email) == user_data.email.lower(),
            models.User.id != user.id,
        ).first():
            raise HTTPException(status_code=400, detail="Bu e-posta zaten kullanımda.")

    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.email is not None:
        user.email = user_data.email
    if user_data.role is not None:
        user.role = user_data.role

    db.commit()
    db.refresh(user)
    return user


def change_password(
    db: Session,
    user_id: int,
    body: schemas.UserPasswordUpdate,
    require_current: bool = True,
):
    """Kullanıcı kendi şifresini değiştiriyorsa mevcut şifre doğrulanır."""
    user = get_user_by_id(db, user_id)
    if require_current:
        if not body.current_password or not verify_password(body.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Mevcut şifre hatalı.")
    validate_password_strength(body.password)
    user.hashed_password = hash_password(body.password)
    db.commit()
    logger.info(f"Şifre değiştirildi: user_id={user_id}")
    return {"message": "Şifre başarıyla güncellendi."}


def delete_user(db: Session, user_id: int):
    user = get_user_by_id(db, user_id)

    if user.role == "admin":
        if _admin_count(db) <= 1:
            raise HTTPException(
                status_code=400,
                detail="Son admin kullanıcısı silinemez.",
            )

    db.delete(user)
    db.commit()
    return {"message": "Kullanıcı silindi."}
