from datetime import date

from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime

VALID_PLAN_STATUSES = ("Aktif", "Beklemede", "Tamamlandı")
VALID_RUN_STATUSES  = ("Bekliyor", "Başarılı", "Başarısız", "Atlandı")


class TestPlanBase(BaseModel):
    title:       str
    description: Optional[str] = None
    status:      Optional[str] = "Aktif"
    project_id:  int
    start_date:  Optional[str] = None
    end_date:    Optional[str] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Plan başlığı boş olamaz.")
        return v.strip()

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v is not None and v not in VALID_PLAN_STATUSES:
            raise ValueError(f"Geçersiz plan statüsü: '{v}'. Geçerli değerler: {list(VALID_PLAN_STATUSES)}")
        return v

    @field_validator("start_date", "end_date")
    @classmethod
    def _date(cls, v):
        # Frontend boş tarih alanını "" gönderiyor → None
        if v in (None, ""):
            return None
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Tarih YYYY-AA-GG formatında olmalı: '{v}'")
        return v

    @model_validator(mode="after")
    def _range(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Bitiş tarihi başlangıç tarihinden önce olamaz.")
        return self

class TestPlanCreate(TestPlanBase):
    pass

class TestPlanItemResponse(BaseModel):
    id:                  int
    test_case_id:        int
    run_status:          str
    note:                Optional[str] = None
    test_case_title:     Optional[str] = None
    test_case_priority:  Optional[str] = None
    test_case_execution_type: Optional[str] = None
    test_case_automatable: bool = False
    test_case_suite_id:  Optional[int] = None
    class Config:
        from_attributes = True

class TestPlanResponse(TestPlanBase):
    id:         int
    created_at: Optional[datetime] = None
    items:      List[TestPlanItemResponse] = []
    class Config:
        from_attributes = True

class TestPlanItemUpdate(BaseModel):
    run_status: str
    note:       Optional[str] = None

    @field_validator("run_status")
    @classmethod
    def _run_status(cls, v):
        if v not in VALID_RUN_STATUSES:
            raise ValueError(f"Geçersiz statü: '{v}'. Geçerli değerler: {list(VALID_RUN_STATUSES)}")
        return v

class BulkAddRequest(BaseModel):
    test_case_ids: List[int]

class BulkItemIds(BaseModel):
    item_ids: List[int]

    @field_validator("item_ids")
    @classmethod
    def _not_empty(cls, v):
        if not v:
            raise ValueError("En az bir kalem seçilmelidir.")
        return v


class BulkItemStatus(BulkItemIds):
    run_status: str

    @field_validator("run_status")
    @classmethod
    def _status(cls, v):
        if v not in VALID_RUN_STATUSES:
            raise ValueError(f"Geçersiz statü: '{v}'. Geçerli değerler: {list(VALID_RUN_STATUSES)}")
        return v
