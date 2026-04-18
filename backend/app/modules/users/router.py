from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from . import schemas, service

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
users_router = APIRouter(prefix="/users", tags=["Users"])

# ── AUTH ENDPOINTLERİ ──
@auth_router.post("/register", response_model=schemas.UserResponse, status_code=201)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return service.create_user(db, user, is_external=True)

@auth_router.post("/login")
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = service.authenticate_user(db, user_data)
    return {
        "message": "Giriş başarılı",
        "user": {
            "id": user.id, "username": user.username,
            "full_name": user.full_name, "email": user.email, "role": user.role
        }
    }

# ── USER ENDPOINTLERİ ──
@users_router.get("/", response_model=list[schemas.UserResponse])
def get_users(db: Session = Depends(get_db)):
    return service.get_users(db)

@users_router.post("/", response_model=schemas.UserResponse, status_code=201)
def create_user_from_panel(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return service.create_user(db, user, is_external=False)

@users_router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    return service.get_user_by_id(db, user_id)

@users_router.put("/{user_id}", response_model=schemas.UserResponse)
def update_user(user_id: int, user_data: schemas.UserUpdate, db: Session = Depends(get_db)):
    return service.update_user(db, user_id, user_data)

@users_router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    return service.delete_user(db, user_id)