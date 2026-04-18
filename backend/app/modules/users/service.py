import re
import bcrypt
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException, status
from . import models, schemas

# ── GÜVENLİK YARDIMCILARI ──
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,50}$")

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def validate_username(username: str):
    if not _USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail="Kullanıcı adı geçersiz. Sadece harf, rakam, _ ve - kullanılabilir.")

def validate_password_strength(password: str):
    if len(password) < 8 or not any(c.isupper() for c in password) or not any(c.isdigit() for c in password):
        raise HTTPException(status_code=400, detail="Şifre en az 8 karakter, 1 büyük harf ve 1 rakam içermelidir.")

# ── BRUTE-FORCE KORUMASI ──
_login_attempts: dict[str, list[datetime]] = {}
MAX_ATTEMPTS  = 5
LOCKOUT_SECS  = 300

def check_rate_limit(identifier: str):
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=LOCKOUT_SECS)
    attempts = _login_attempts.get(identifier, [])
    attempts = [t for t in attempts if t > window_start]
    _login_attempts[identifier] = attempts
    if len(attempts) >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Çok fazla başarısız giriş denemesi. 5 dakika bekleyin.")

# ── İŞLEMLER (CRUD & AUTH) ──
def create_user(db: Session, user: schemas.UserCreate, is_external: bool = False):
    validate_username(user.username)
    validate_password_strength(user.password)

    existing = db.query(models.User).filter(
        or_(models.User.email == user.email, models.User.username == user.username)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="E-posta veya kullanıcı adı zaten kullanımda.")

    new_user = models.User(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        hashed_password=hash_password(user.password),
        role="viewer" if is_external else getattr(user, 'role', 'viewer'),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

def authenticate_user(db: Session, user_data: schemas.UserLogin):
    identifier = user_data.identifier.lower().strip()
    check_rate_limit(identifier)

    db_user = db.query(models.User).filter(
        or_(models.User.username == identifier, models.User.email == identifier)
    ).first()

    dummy_hash = "$2b$12$KIX7x5jXiINEKsLPOJ/HZuF1pZ5VqGz3xJSXYcgqQgQw6ZcFzBn5O"
    password_ok = verify_password(user_data.password, db_user.hashed_password if db_user else dummy_hash)

    if not db_user or not password_ok:
        _login_attempts.setdefault(identifier, []).append(datetime.utcnow())
        raise HTTPException(status_code=401, detail="Kullanıcı adı, e-posta veya şifre hatalı.")

    _login_attempts.pop(identifier, None)
    return db_user

def get_users(db: Session):
    return db.query(models.User).all()

def get_user_by_id(db: Session, user_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    return user

def update_user(db: Session, user_id: int, user_data: schemas.UserUpdate):
    user = get_user_by_id(db, user_id)
    if user_data.email and user_data.email != user.email:
        if db.query(models.User).filter(models.User.email == user_data.email).first():
            raise HTTPException(status_code=400, detail="Bu e-posta zaten kullanımda.")
            
    if user_data.full_name is not None: user.full_name = user_data.full_name
    if user_data.email     is not None: user.email     = user_data.email
    if user_data.role      is not None: user.role      = user_data.role
    db.commit()
    db.refresh(user)
    return user

def delete_user(db: Session, user_id: int):
    user = get_user_by_id(db, user_id)
    if user.role == "admin":
        admin_count = db.query(models.User).filter(models.User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Son admin kullanıcısı silinemez.")
    db.delete(user)
    db.commit()
    return {"message": "Kullanıcı silindi."}