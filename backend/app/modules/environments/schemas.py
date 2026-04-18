from pydantic import BaseModel
from typing import Optional

class EnvironmentCreate(BaseModel):
    name:        str
    project_id:  int
    url:         str
    description: Optional[str] = None

class EnvironmentResponse(EnvironmentCreate):
    id: int
    class Config:
        from_attributes = True

class VariableCreate(BaseModel):
    key:        str
    value:      str
    project_id: Optional[int]  = None
    env_id:     Optional[int]  = None
    is_secret:  Optional[bool] = False

class VariableResponse(VariableCreate):
    id: int
    class Config:
        from_attributes = True