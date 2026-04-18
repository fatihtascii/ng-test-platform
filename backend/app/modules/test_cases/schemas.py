from pydantic import BaseModel
from typing import Optional

class TestCaseBase(BaseModel):
    title:             str
    description:       Optional[str] = None
    status:            Optional[str] = "Test Edilmedi"
    priority:          Optional[str] = "Orta"
    project_id:        int
    gherkin_scenario:  Optional[str] = None

class TestCaseCreate(TestCaseBase):
    pass

class TestCaseResponse(TestCaseBase):
    id: int
    class Config:
        from_attributes = True

# BDD Kod Üretimi için özel şema
class BDDGenerateRequest(BaseModel):
    gherkin: str