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

class UserPasswordUpdate(BaseModel):
    password: str

class UserResponse(BaseModel):
    id:        int
    username:  str
    email:     Optional[EmailStr] = None
    full_name: Optional[str]      = None
    role:      Optional[str]      = "viewer"
    class Config:
        from_attributes = True