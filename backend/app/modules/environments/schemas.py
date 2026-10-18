import re
from urllib.parse import urlparse
from pydantic import BaseModel, field_validator
from typing import Optional

_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,199}$")


class EnvironmentCreate(BaseModel):
    name:        str
    project_id:  int
    url:         str
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Ortam adı boş olamaz.")
        if len(v) > 200:
            raise ValueError("Ortam adı en fazla 200 karakter olabilir.")
        return v

    @field_validator("url")
    @classmethod
    def _url(cls, v: str) -> str:
        v = v.strip().rstrip("/")
        p = urlparse(v)
        if p.scheme not in ("http", "https") or not p.netloc:
            raise ValueError("Geçerli bir http(s) adresi girin, ör. https://staging.ornek.com")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        return (v or "").strip() or None


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

    @field_validator("key")
    @classmethod
    def _key(cls, v: str) -> str:
        v = re.sub(r"\s+", "_", v.strip()).upper()
        if not _KEY_RE.match(v):
            raise ValueError("Anahtar büyük harfle başlamalı; yalnızca A-Z, 0-9 ve _ içerebilir (ör. ADMIN_PASSWORD).")
        return v

    @field_validator("value")
    @classmethod
    def _value(cls, v: str) -> str:
        if v is None or v == "":
            raise ValueError("Değer boş olamaz.")
        return v


class VariableResponse(VariableCreate):
    id: int
    class Config:
        from_attributes = True


class ResolvedVariable(BaseModel):
    key:       str
    value:     str
    is_secret: bool
    source:    str          # "env" | "project" | "global"
    variable_id: int
