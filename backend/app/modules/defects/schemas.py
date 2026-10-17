from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

VALID_STATUSES   = ("Open", "In Progress", "Re-test", "Resolved")
VALID_SEVERITIES = ("Düşük", "Orta", "Yüksek", "Kritik")


def _check(value, allowed, name):
    if value is not None and value not in allowed:
        raise ValueError(f"Geçersiz {name}: '{value}'. Geçerli değerler: {list(allowed)}")
    return value


class FailedDetail(BaseModel):
    case_id:  Optional[int] = None
    title:    Optional[str] = None
    error:    Optional[str] = None
    severity: Optional[str] = None


class DefectCreate(BaseModel):
    title:          str = Field(..., min_length=1, max_length=500)
    description:    Optional[str] = None
    severity:       str = "Orta"
    status:         str = "Open"
    project_id:     int = Field(..., gt=0)
    test_run_id:    Optional[int] = None
    test_case_id:   Optional[int] = None
    failed_details: List[FailedDetail] = []

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if not v.strip():
            raise ValueError("Başlık boş olamaz.")
        return v.strip()

    @field_validator("severity")
    @classmethod
    def _sev(cls, v):
        return _check(v, VALID_SEVERITIES, "önem derecesi")

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        return _check(v, VALID_STATUSES, "statü")


class DefectUpdate(BaseModel):
    title:       Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    severity:    Optional[str] = None
    status:      Optional[str] = None
    project_id:  Optional[int] = Field(None, gt=0)

    @field_validator("severity")
    @classmethod
    def _sev(cls, v):
        return _check(v, VALID_SEVERITIES, "önem derecesi")

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        return _check(v, VALID_STATUSES, "statü")


class DefectBulkStatus(BaseModel):
    ids:    List[int] = Field(..., min_length=1)
    status: str

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        return _check(v, VALID_STATUSES, "statü")


class DefectResponse(BaseModel):
    id:             int
    code:           str
    title:          str
    description:    Optional[str] = None
    severity:       str
    status:         str
    source:         str
    project_id:     int
    project_name:   Optional[str] = None
    test_run_id:    Optional[int] = None
    test_run_name:  Optional[str] = None
    test_case_id:   Optional[int] = None
    failed_details: List[FailedDetail] = []
    failed_count:   int = 0
    created_by:     Optional[int] = None
    created_by_name: Optional[str] = None
    created_at:     Optional[datetime] = None
    updated_at:     Optional[datetime] = None
