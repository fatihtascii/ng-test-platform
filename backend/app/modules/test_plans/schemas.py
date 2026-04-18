from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TestPlanBase(BaseModel):
    title:       str
    description: Optional[str] = None
    status:      Optional[str] = "Aktif"
    project_id:  int
    start_date:  Optional[str] = None
    end_date:    Optional[str] = None

class TestPlanCreate(TestPlanBase):
    pass

class TestPlanItemResponse(BaseModel):
    id:                  int
    test_case_id:        int
    run_status:          str
    note:                Optional[str] = None
    test_case_title:     Optional[str] = None
    test_case_priority:  Optional[str] = None
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

class BulkAddRequest(BaseModel):
    test_case_ids: List[int]