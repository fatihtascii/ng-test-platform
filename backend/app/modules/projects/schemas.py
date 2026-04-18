from pydantic import BaseModel
from typing import Optional

class ProjectBase(BaseModel):
    name:        str
    description: Optional[str] = None
    status:      Optional[str] = "Aktif"

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int
    class Config:
        from_attributes = True