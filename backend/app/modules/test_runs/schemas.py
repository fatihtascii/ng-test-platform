from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TestRunCreate(BaseModel):
    name:        str
    description: Optional[str] = None
    status:      Optional[str] = "Aktif"
    project_id:  int
    results:     Optional[str] = "[]"

class TestRunResponse(BaseModel):
    id:          int
    name:        str
    description: Optional[str] = None
    status:      str
    project_id:  int
    results:     Optional[str] = "[]"
    created_at:  Optional[datetime] = None
    
    class Config:
        from_attributes = True