"""
FastAPI dependency'leri: DB session, oturumdaki kullanıcı ve izin kontrolü.

Kullanım:
    @router.get("/", dependencies=[Depends(require_permission("projects.view"))])

İzinler DB'deki roles / role_permissions tablolarından okunur; "admin" rolü
her izne sahiptir. Rol izinleri panelden değiştirildiğinde hemen geçerli olur.
"""
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, get_db  # noqa: F401  (get_db buradan da import ediliyor)
from app.core.security import decode_access_token

ADMIN_ROLE = "admin"

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Oturum geçersiz veya süresi doldu. Lütfen tekrar giriş yapın.",
    headers={"WWW-Authenticate": "Bearer"},
)


def _extract_token(request: Request, allow_query: bool) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    if allow_query:
        # EventSource ve WebSocket header gönderemediği için yalnızca o endpoint'lerde
        return request.query_params.get("token")
    return None


def user_from_token(db: Session, token: str | None):
    """Token'dan kullanıcıyı çözer; geçersizse None."""
    from app.modules.users.models import User

    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        return None
    user = db.query(User).filter(User.id == user_id).first()
    # Devre dışı bırakılan hesabın açık oturumları da hemen geçersiz olur
    if user is not None and not getattr(user, "is_active", True):
        return None
    return user


def get_permissions_for_role(db: Session, role: str) -> set[str]:
    from app.modules.roles.models import Permission, Role, RolePermission

    if role == ADMIN_ROLE:
        return {p.key for p in db.query(Permission).all()}
    rows = (
        db.query(Permission.key)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .filter(Role.name == role)
        .all()
    )
    return {r[0] for r in rows}


def has_permission(db: Session, user, key: str) -> bool:
    if user.role == ADMIN_ROLE:
        return True
    return key in get_permissions_for_role(db, user.role)


def get_current_user(request: Request, db: Session = Depends(get_db)):
    user = user_from_token(db, _extract_token(request, allow_query=False))
    if not user:
        raise _UNAUTHORIZED
    return user


def get_current_user_query_ok(request: Request, db: Session = Depends(get_db)):
    """SSE gibi header gönderemeyen istemciler için ?token= de kabul eder."""
    user = user_from_token(db, _extract_token(request, allow_query=True))
    if not user:
        raise _UNAUTHORIZED
    return user


def _permission_checker(key: str, user_dep):
    def checker(user=Depends(user_dep), db: Session = Depends(get_db)):
        if not has_permission(db, user, key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bu işlem için yetkiniz yok ({key}).",
            )
        return user
    return checker


def require_permission(key: str):
    return _permission_checker(key, get_current_user)


def require_permission_query_ok(key: str):
    return _permission_checker(key, get_current_user_query_ok)
