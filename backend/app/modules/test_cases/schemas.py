from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
import json

# ── İzin verilen değerler (router ve model ile senkron) ───────────
VALID_STATUSES        = {"Taslak", "Test Edilmedi", "Başarılı", "Başarısız"}
VALID_PRIORITIES      = {"Düşük", "Orta", "Yüksek", "Kritik"}
VALID_EXECUTION_TYPES = {"Manual", "Automated"}


# ── Ortak Base ────────────────────────────────────────────────────
class TestCaseBase(BaseModel):
    title: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Test senaryosu başlığı",
    )
    description:      Optional[str] = Field(None, description="JSON adım verisi veya düz metin")
    status:           Optional[str] = Field("Test Edilmedi", description="Test durumu")
    priority:         Optional[str] = Field("Orta",          description="Öncelik seviyesi")
    project_id:       int           = Field(..., gt=0,        description="Bağlı proje ID")
    gherkin_scenario: Optional[str] = Field(None,            description="BDD Gherkin senaryosu")
    tags:             Optional[str] = Field("[]",            description="JSON array string: '[\"smoke\",\"e2e\"]'")
    execution_type:   Optional[str] = Field("Manual",        description="Manual veya Automated")
    automation_script:Optional[str] = Field(None,            description="Python/Playwright otomasyon kodu")

    # Başlık başındaki/sonundaki boşluklar temizleniyor
    @field_validator("title")
    @classmethod
    def title_strip(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Başlık boş veya yalnızca boşluk olamaz.")
        return stripped

    # Geçersiz status değeri DB'ye ulaşmadan schema seviyesinde reddediliyor
    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"Geçersiz status: '{v}'. Geçerli değerler: {sorted(VALID_STATUSES)}")
        return v

    # Geçersiz priority değeri reddediliyor
    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PRIORITIES:
            raise ValueError(f"Geçersiz priority: '{v}'. Geçerli değerler: {sorted(VALID_PRIORITIES)}")
        return v

    # Geçersiz execution_type reddediliyor
    @field_validator("execution_type")
    @classmethod
    def validate_execution_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_EXECUTION_TYPES:
            raise ValueError(f"Geçersiz execution_type: '{v}'. Geçerli değerler: {sorted(VALID_EXECUTION_TYPES)}")
        return v

    # tags JSON olarak parse edilebiliyor mu kontrol ediliyor.
    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[str]) -> str:
        if v is None:
            return "[]"
        try:
            parsed = json.loads(v)
            if not isinstance(parsed, list):
                raise ValueError("tags bir JSON array olmalıdır.")
            if not all(isinstance(t, str) for t in parsed):
                raise ValueError("tags içindeki tüm elemanlar string olmalıdır.")
        except json.JSONDecodeError:
            raise ValueError(f"tags geçerli bir JSON string değil: {v!r}")
        return v

    # 🚀 FIX: automation_script SİLİCİSİ İPTAL EDİLDİ
    # Kullanıcı test tipini yanlışlıkla "Manual" seçse veya Frontend eksik data gönderse bile,
    # saatlerce yazdığı otomasyon kodu ÇÖPE GİTMESİN diye bu validator'ı kapattık.
    # @model_validator(mode="after")
    # def normalize_automation_script(self) -> "TestCaseBase":
    #     if self.execution_type == "Manual" and self.automation_script:
    #         self.automation_script = None
    #     return self


# ── Create ────────────────────────────────────────────────────────
class TestCaseCreate(TestCaseBase):
    pass


# ── Update (Partial) ──────────────────────────────────────────────
class TestCaseUpdate(BaseModel):
    title:             Optional[str] = Field(None, min_length=1, max_length=500)
    description:       Optional[str] = None
    status:            Optional[str] = None
    priority:          Optional[str] = None
    project_id:        Optional[int] = Field(None, gt=0)
    gherkin_scenario:  Optional[str] = None
    tags:              Optional[str] = None
    execution_type:    Optional[str] = None
    automation_script: Optional[str] = None

    @field_validator("title")
    @classmethod
    def title_strip(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Başlık boş olamaz.")
            return stripped
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"Geçersiz status: '{v}'.")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PRIORITIES:
            raise ValueError(f"Geçersiz priority: '{v}'.")
        return v

    @field_validator("execution_type")
    @classmethod
    def validate_execution_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_EXECUTION_TYPES:
            raise ValueError(f"Geçersiz execution_type: '{v}'.")
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        try:
            parsed = json.loads(v)
            if not isinstance(parsed, list):
                raise ValueError("tags bir JSON array olmalıdır.")
            if not all(isinstance(t, str) for t in parsed):
                raise ValueError("tags içindeki tüm elemanlar string olmalıdır.")
        except json.JSONDecodeError:
            raise ValueError(f"tags geçerli bir JSON string değil: {v!r}")
        return v


# ── Response ──────────────────────────────────────────────────────
class TestCaseResponse(TestCaseBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Bulk Operations ───────────────────────────────────────────────
class TestCaseBulkDelete(BaseModel):
    ids: List[int] = Field(..., min_length=1, description="Silinecek test ID'leri")


class TestCaseBulkUpdateStatus(BaseModel):
    ids:    List[int] = Field(..., min_length=1, description="Güncellenecek test ID'leri")
    status: str       = Field(..., description="Yeni durum değeri")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"Geçersiz status: '{v}'. Geçerli değerler: {sorted(VALID_STATUSES)}")
        return v


# ── BDD / AI Şemaları ─────────────────────────────────────────────
class BDDGenerateRequest(BaseModel):
    gherkin: str = Field(..., min_length=10, description="Gherkin senaryosu (en az 10 karakter)")

    @field_validator("gherkin")
    @classmethod
    def gherkin_strip(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Gherkin senaryosu boş olamaz.")
        return stripped


class BDDGenerateResponse(BaseModel):
    code: str = Field(..., description="Üretilen Pytest-BDD Python kodu")