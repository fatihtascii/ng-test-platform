"""
Test Runs router.

DÜZELTMELER:
- GET /test-runs/: project_id ve status query param filtresi eklendi.
- skip/limit pagination parametreleri eklendi.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from . import schemas, service

logger = logging.getLogger("ng-test.test_runs")
router = APIRouter(prefix="/test-runs", tags=["Test Runs"])


@router.post("/", dependencies=[Depends(require_permission("test_runs.create"))], response_model=schemas.TestRunResponse, status_code=201)
def create_test_run(run: schemas.TestRunCreate, db: Session = Depends(get_db)):
    return service.create_test_run(db, run)


@router.get("/", dependencies=[Depends(require_permission("test_runs.view"))], response_model=list[schemas.TestRunResponse])
def get_test_runs(
    db:         Session      = Depends(get_db),
    # FIX: Filtreler eklendi — frontend proje bazlı gösteriyor
    project_id: Optional[int] = Query(None, description="Projeye göre filtrele"),
    status:     Optional[str] = Query(None, description="Statüye göre filtrele"),
    is_defect:  Optional[bool] = Query(None, description="true: sadece defect kayıtları, false: sadece koşumlar"),
    test_plan_id: Optional[int] = Query(None, description="Plana bağlı koşumlar"),
    skip:       int           = Query(0,    ge=0,  description="Kaç kayıt atla"),
    limit:      int           = Query(200,  ge=1, le=500, description="Max kayıt"),
):
    return service.get_test_runs(db, project_id=project_id, status=status, is_defect=is_defect, skip=skip, limit=limit, test_plan_id=test_plan_id)


@router.get("/{run_id}", dependencies=[Depends(require_permission("test_runs.view"))], response_model=schemas.TestRunResponse)
def get_test_run(run_id: int, db: Session = Depends(get_db)):
    return service.get_test_run_by_id(db, run_id)


@router.put("/{run_id}", dependencies=[Depends(require_permission("test_runs.execute"))], response_model=schemas.TestRunResponse)
def update_test_run(run_id: int, data: schemas.TestRunCreate, db: Session = Depends(get_db)):
    return service.update_test_run(db, run_id, data)


@router.delete("/{run_id}", dependencies=[Depends(require_permission("test_runs.delete"))])
def delete_test_run(run_id: int, db: Session = Depends(get_db)):
    return service.delete_test_run(db, run_id)