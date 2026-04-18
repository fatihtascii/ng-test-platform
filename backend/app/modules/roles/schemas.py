from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime

class PermissionResponse(BaseModel):
    id:          int
    key:         str
    name:        str
    description: Optional[str] = None
    module:      str
    class Config:
        from_attributes = True

class RoleCreate(BaseModel):
    name:         str
    display_name: str
    description:  Optional[str] = None
    color:        Optional[str] = "indigo"

class RoleUpdate(BaseModel):
    display_name: Optional[str] = None
    description:  Optional[str] = None
    color:        Optional[str] = None

class RolePermissionUpdate(BaseModel):
    permission_ids: List[int]

class RoleResponse(BaseModel):
    id:           int
    name:         str
    display_name: str
    description:  Optional[str] = None
    color:        str
    is_system:    bool
    created_at:   Optional[datetime] = None
    permissions:  List[PermissionResponse] = []
    
    class Config:
        from_attributes = True

    @field_validator("permissions", mode="before")
    @classmethod
    def flatten_permissions(cls, v):
        result = []
        for item in v:
            if hasattr(item, "permission"):
                result.append(item.permission)
            else:
                result.append(item)
        return result