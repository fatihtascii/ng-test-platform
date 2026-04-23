import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.deps import get_db
from . import schemas, service

logger = logging.getLogger("ng-test.test_runs")
router = APIRouter(prefix="/test-runs", tags=["Test Runs"])

# ── REST ENDPOINT'LERİ ──
@router.post("/", response_model=schemas.TestRunResponse, status_code=201)
def create_test_run(run: schemas.TestRunCreate, db: Session = Depends(get_db)):
    return service.create_test_run(db, run)

@router.get("/", response_model=list[schemas.TestRunResponse])
def get_test_runs(db: Session = Depends(get_db)):
    return service.get_test_runs(db)

@router.get("/{run_id}", response_model=schemas.TestRunResponse)
def get_test_run(run_id: int, db: Session = Depends(get_db)):
    return service.get_test_run_by_id(db, run_id)

@router.put("/{run_id}", response_model=schemas.TestRunResponse)
def update_test_run(run_id: int, data: schemas.TestRunCreate, db: Session = Depends(get_db)):
    return service.update_test_run(db, run_id, data)

@router.delete("/{run_id}")
def delete_test_run(run_id: int, db: Session = Depends(get_db)):
    return service.delete_test_run(db, run_id)