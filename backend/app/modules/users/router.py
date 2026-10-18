"""
Users & Auth router.

- /auth/login JWT access token döner; diğer tüm endpoint'ler bu token'ı ister.
- /auth/register herkese açık ama her zaman "viewer" rolüyle hesap açar.
- Kullanıcı oluşturma/düzenleme/silme "users.manage" izni ister.
- Şifre: kullanıcı kendi şifresini mevcut şifreyle değiştirir;
  "users.manage" izni olan başkasının şifresini sıfırlayabilir.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import (
    get_db, get_current_user, require_permission,
    get_permissions_for_role, has_permission,
)
from app.core.security import create_access_token, EXPIRE_MINUTES
from . import schemas, service

auth_router  = APIRouter(prefix="/auth",  tags=["Authentication"])
users_router = APIRouter(prefix="/users", tags=["Users"])


def _user_payload(user) -> dict:
    return {
        "id":        user.id,
        "username":  user.username,
        "full_name": user.full_name,
        "email":     user.email,
        "role":      user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


# ── AUTH ──────────────────────────────────────────────────────────

@auth_router.post("/register", response_model=schemas.UserResponse, status_code=201)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return service.create_user(db, user, is_external=True)


@auth_router.post("/login")
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = service.authenticate_user(db, user_data)
    return {
        "message":      "Giriş başarılı",
        "access_token": create_access_token(user.id, user.role),
        "token_type":   "bearer",
        "expires_in":   EXPIRE_MINUTES * 60,
        "user":         _user_payload(user),
    }


@auth_router.get("/me")
def me(current=Depends(get_current_user), db: Session = Depends(get_db)):
    """Oturumdaki kullanıcı ve rolünün izinleri (frontend yetki kontrolü için)."""
    return {
        **_user_payload(current),
        "permissions": sorted(get_permissions_for_role(db, current.role)),
    }


@auth_router.patch("/me")
def update_me(
    body: schemas.ProfileUpdate,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Kendi ad/e-posta bilgisini güncelle. Rol buradan değiştirilemez."""
    if body.full_name is not None and not body.full_name.strip():
        raise HTTPException(status_code=400, detail="Ad soyad boş olamaz.")
    data = schemas.UserUpdate(
        full_name=body.full_name.strip() if body.full_name is not None else None,
        email=body.email,
    )
    user = service.update_user(db, current.id, data, actor=current)
    return _user_payload(user)


@auth_router.post("/me/password")
def change_my_password(
    body: schemas.OwnPasswordChange,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Kendi şifresini değiştir — yetkisi ne olursa olsun mevcut şifre zorunlu."""
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="Yeni şifre mevcut şifreyle aynı olamaz.")
    return service.change_password(
        db, current.id,
        schemas.UserPasswordUpdate(password=body.new_password, current_password=body.current_password),
        require_current=True,
    )


# ── USERS ─────────────────────────────────────────────────────────

@users_router.get("/", response_model=list[schemas.UserResponse],
                  dependencies=[Depends(require_permission("users.view"))])
def get_users(db: Session = Depends(get_db)):
    return service.get_users(db)


@users_router.post("/", response_model=schemas.UserResponse, status_code=201,
                   dependencies=[Depends(require_permission("users.manage"))])
def create_user_from_panel(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return service.create_user(db, user, is_external=False)


@users_router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int, current=Depends(get_current_user), db: Session = Depends(get_db)):
    if current.id != user_id and not has_permission(db, current, "users.view"):
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok (users.view).")
    return service.get_user_by_id(db, user_id)


@users_router.put("/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_data: schemas.UserUpdate,
    current=Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
):
    return service.update_user(db, user_id, user_data, actor=current)


@users_router.patch("/{user_id}/password")
def change_password(
    user_id: int,
    body: schemas.UserPasswordUpdate,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_self = current.id == user_id
    can_manage = has_permission(db, current, "users.manage")
    if not is_self and not can_manage:
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok (users.manage).")
    # Normal kullanıcı kendi şifresini mevcut şifreyle değiştirir; users.manage yetkilisi
    # (panelde mevcut şifre alanı yok) doğrudan sıfırlayabilir.
    return service.change_password(db, user_id, body, require_current=is_self and not can_manage, actor=current)


@users_router.delete("/{user_id}")
def delete_user(
    user_id: int,
    current=Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz.")
    return service.delete_user(db, user_id, actor=current)
