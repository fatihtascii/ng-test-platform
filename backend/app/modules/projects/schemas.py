from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

VALID_STATUSES = ("Aktif", "Beklemede", "Tamamlandı")


def _clean_name(v):
    if v is None:
        return v
    v = " ".join(v.split())
    if not v:
        raise ValueError("Proje adı boş olamaz.")
    return v


def _check_status(v):
    if v is not None and v not in VALID_STATUSES:
        raise ValueError(f"Geçersiz statü: '{v}'. Geçerli değerler: {list(VALID_STATUSES)}")
    return v


class ProjectCreate(BaseModel):
    name:        str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    status:      str = "Aktif"

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return _clean_name(v)

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        return _check_status(v)

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        return (v.strip() or None) if isinstance(v, str) else v


class ProjectUpdate(BaseModel):
    """Kısmi güncelleme: gönderilmeyen alan değişmez."""
    name:        Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    status:      Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return _clean_name(v)

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        return _check_status(v)

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        return (v.strip() or None) if isinstance(v, str) else v


class ProjectStats(BaseModel):
    cases:            int = 0
    cases_by_status:  dict[str, int] = {}
    automated:        int = 0
    plans:            int = 0
    active_plans:     int = 0
    runs:             int = 0
    last_run_at:      Optional[datetime] = None
    open_defects:     int = 0
    critical_defects: int = 0
    environments:     int = 0


class ProjectResponse(BaseModel):
    id:          int
    name:        str
    description: Optional[str] = None
    status:      str
    created_at:  Optional[datetime] = None
    updated_at:  Optional[datetime] = None
    stats:       Optional[ProjectStats] = None

    class Config:
        from_attributes = True
