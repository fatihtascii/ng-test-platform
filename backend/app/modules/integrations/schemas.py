from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class IntegrationUpsert(BaseModel):
    is_active: bool = False
    config: Optional[Dict[str, Any]] = {}


class IntegrationResponse(BaseModel):
    id:         Optional[int] = None          # kayıt henüz yoksa None
    provider:   str
    is_active:  bool
    config:     Dict[str, Any] = {}
    configured: bool = False                  # zorunlu alanlar dolu mu
    updated_at: Optional[datetime] = None


class EventResponse(BaseModel):
    id:         int
    event:      str
    ok:         bool
    message:    Optional[str] = None
    ref:        Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
