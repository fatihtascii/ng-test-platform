from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import Optional

class UserBase(BaseModel):
    email:     Optional[EmailStr] = None
    username:  str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role:     Optional[str] = "viewer"

class UserLogin(BaseModel):
    identifier: str
    password:   str

class UserUpdate(BaseModel):
    full_name: Optional[str]      = None
    email:     Optional[EmailStr] = None
    role:      Optional[str]      = None
    is_active: Optional[bool]     = None

class UserPasswordUpdate(BaseModel):
    password:         str
    current_password: Optional[str] = None  # kendi şifresini değiştiren kullanıcı için zorunlu

class ProfileUpdate(BaseModel):
    """Kullanıcının kendi profilinde değiştirebildiği alanlar (rol hariç)."""
    full_name: Optional[str]      = None
    email:     Optional[EmailStr] = None

class OwnPasswordChange(BaseModel):
    current_password: str
    new_password:     str

class UserResponse(BaseModel):
    id:        int
    username:  str
    email:     Optional[EmailStr] = None
    full_name: Optional[str]      = None
    role:      Optional[str]      = "viewer"
    is_active: bool               = True
    created_at:    Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    class Config:
        from_attributes = True