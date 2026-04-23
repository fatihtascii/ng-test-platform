# backend/app/modules/integrations/schemas.py
from pydantic import BaseModel
from typing import Optional, Dict, Any


class IntegrationUpsert(BaseModel):
    is_active: bool = False
    config: Optional[Dict[str, Any]] = {}


class IntegrationResponse(BaseModel):
    id:        int
    provider:  str
    is_active: bool
    config:    Optional[Dict[str, Any]] = {}

    class Config:
        from_attributes = True