from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class Profile(BaseModel):
    """Hazır koşum: pytest -m ifadesi (boş = tümü)."""
    name:   str = Field(..., min_length=1, max_length=60)
    marker: str = Field("", max_length=300)

    @field_validator("name", "marker")
    @classmethod
    def _strip(cls, v):
        return v.strip()


class SuiteBase(BaseModel):
    name:            Optional[str] = Field(None, max_length=200)
    repo_url:        Optional[str] = Field(None, max_length=500)
    branch:          Optional[str] = Field(None, max_length=200)
    token:           Optional[str] = None           # maskeli gelirse değişmez; "" → sil
    test_path:       Optional[str] = Field(None, max_length=300)
    environment_id:  Optional[int] = None
    profiles:        Optional[list[Profile]] = None
    workers:         Optional[int] = Field(None, ge=1, le=16)
    timeout_minutes: Optional[int] = Field(None, ge=5, le=720)


class SuiteCreate(SuiteBase):
    name:       str = Field(..., min_length=1, max_length=200)
    project_id: int = Field(..., gt=0)
    repo_url:   str = Field(..., max_length=500)


class SuiteUpdate(SuiteBase):
    project_id: Optional[int] = Field(None, gt=0)


class SuiteResponse(BaseModel):
    id:              int
    name:            str
    project_id:      int
    project_name:    Optional[str] = None
    repo_url:        str
    branch:          str
    token:           Optional[str] = None           # maskeli
    test_path:       str
    environment_id:  Optional[int] = None
    environment_name: Optional[str] = None
    profiles:        list[Profile] = []
    workers:         int
    timeout_minutes: int
    sync_status:     str
    syncing:         bool = False
    sync_summary:    Optional[dict] = None
    commit_sha:      Optional[str] = None
    commit_message:  Optional[str] = None
    synced_at:       Optional[datetime] = None
    case_count:      int = 0
    created_at:      Optional[datetime] = None


class SyncState(BaseModel):
    sync_status: str
    syncing:     bool
    sync_log:    Optional[str] = None
    sync_summary: Optional[dict] = None
    commit_sha:  Optional[str] = None
    synced_at:   Optional[datetime] = None
