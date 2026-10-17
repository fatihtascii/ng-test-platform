from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime

# FIX: Geçerli status değerleri — "Başarısız" eklendi (otomasyon kaydı için)
VALID_RUN_STATUSES = {"Aktif", "Beklemede", "Tamamlandı", "Başarısız"}


class TestRunCreate(BaseModel):
    name:         str
    description:  Optional[str] = None
    status:       Optional[str] = "Aktif"
    project_id:   int
    # FIX: test_plan_id eklendi — frontend plan seçimiyle geliyor
    test_plan_id: Optional[int] = None
    results:      Optional[str] = "[]"
    is_defect:    bool          = False

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Koşum adı boş olamaz.")
        return v.strip()

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_RUN_STATUSES:
            raise ValueError(
                f"Geçersiz status: '{v}'. "
                f"Geçerli değerler: {sorted(VALID_RUN_STATUSES)}"
            )
        return v


class TestRunResponse(BaseModel):
    id:           int
    name:         str
    description:  Optional[str] = None
    status:       str
    project_id:   int
    test_plan_id: Optional[int] = None   # FIX: eklendi
    results:      Optional[str] = "[]"
    is_defect:    bool          = False
    created_at:   Optional[datetime] = None
    updated_at:   Optional[datetime] = None

    class Config:
        from_attributes = True