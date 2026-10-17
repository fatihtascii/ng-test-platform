from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from . import schemas, service

router = APIRouter(prefix="/defects", tags=["Defects"])


@router.get("/", response_model=list[schemas.DefectResponse],
            dependencies=[Depends(require_permission("defects.view"))])
def list_defects(
    db: Session = Depends(get_db),
    project_id:  Optional[int] = Query(None),
    status:      Optional[str] = Query(None),
    severity:    Optional[str] = Query(None),
    test_run_id: Optional[int] = Query(None),
):
    return service.list_defects(db, project_id, status, severity, test_run_id)


@router.post("/bulk-status", dependencies=[Depends(require_permission("defects.manage"))])
def bulk_status(body: schemas.DefectBulkStatus, db: Session = Depends(get_db)):
    return service.bulk_status(db, body.ids, body.status)


@router.get("/{defect_id}", response_model=schemas.DefectResponse,
            dependencies=[Depends(require_permission("defects.view"))])
def get_defect(defect_id: int, db: Session = Depends(get_db)):
    return service.get_defect(db, defect_id)


@router.post("/", response_model=schemas.DefectResponse, status_code=201)
def create_defect(
    body: schemas.DefectCreate,
    current=Depends(require_permission("defects.manage")),
    db: Session = Depends(get_db),
):
    return service.create_defect(db, body, current.id)


@router.patch("/{defect_id}", response_model=schemas.DefectResponse,
              dependencies=[Depends(require_permission("defects.manage"))])
def update_defect(defect_id: int, body: schemas.DefectUpdate, db: Session = Depends(get_db)):
    return service.update_defect(db, defect_id, body)


@router.delete("/{defect_id}", dependencies=[Depends(require_permission("defects.manage"))])
def delete_defect(defect_id: int, db: Session = Depends(get_db)):
    return service.delete_defect(db, defect_id)
