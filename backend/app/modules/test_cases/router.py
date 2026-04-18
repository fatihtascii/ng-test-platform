from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from . import schemas, service

router = APIRouter(prefix="/test-cases", tags=["Test Cases"])

@router.post("/", response_model=schemas.TestCaseResponse, status_code=201)
def create_test_case(test_case: schemas.TestCaseCreate, db: Session = Depends(get_db)):
    return service.create_test_case(db, test_case)

@router.get("/", response_model=list[schemas.TestCaseResponse])
def get_test_cases(db: Session = Depends(get_db)):
    return service.get_test_cases(db)

@router.put("/{tc_id}", response_model=schemas.TestCaseResponse)
def update_test_case(tc_id: int, data: schemas.TestCaseCreate, db: Session = Depends(get_db)):
    return service.update_test_case(db, tc_id, data)

@router.delete("/{tc_id}")
def delete_test_case(tc_id: int, db: Session = Depends(get_db)):
    return service.delete_test_case(db, tc_id)

@router.post("/generate-bdd-code")
def generate_bdd_code(data: schemas.BDDGenerateRequest):
    return service.generate_bdd_code(data.gherkin)