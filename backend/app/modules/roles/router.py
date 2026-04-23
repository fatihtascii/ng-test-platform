from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.deps import get_db
from . import schemas, service

perm_router = APIRouter(prefix="/permissions", tags=["Permissions"])
role_router = APIRouter(prefix="/roles", tags=["Roles"])

# ── PERMISSIONS ──
@perm_router.get("/", response_model=list[schemas.PermissionResponse])
def get_permissions(db: Session = Depends(get_db)):
    return service.get_permissions(db)

# ── ROLES ──
@role_router.get("/", response_model=list[schemas.RoleResponse])
def get_roles(db: Session = Depends(get_db)):
    return service.get_roles(db)

@role_router.post("/", response_model=schemas.RoleResponse, status_code=201)
def create_role(role: schemas.RoleCreate, db: Session = Depends(get_db)):
    return service.create_role(db, role)

@role_router.put("/{role_id}", response_model=schemas.RoleResponse)
def update_role(role_id: int, data: schemas.RoleUpdate, db: Session = Depends(get_db)):
    return service.update_role(db, role_id, data)

@role_router.delete("/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db)):
    return service.delete_role(db, role_id)

@role_router.put("/{role_id}/permissions", response_model=schemas.RoleResponse)
def update_role_permissions(role_id: int, data: schemas.RolePermissionUpdate, db: Session = Depends(get_db)):
    return service.update_role_permissions(db, role_id, data)