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
    assignee_id: Optional[int] = Query(None),
    unassigned:  bool = Query(False, description="Yalnızca kimseye atanmamış kayıtlar"),
):
    return service.list_defects(db, project_id, status, severity, test_run_id, assignee_id, unassigned)


@router.get("/assignees", response_model=list[schemas.Assignee],
            dependencies=[Depends(require_permission("defects.view"))])
def assignees(db: Session = Depends(get_db)):
    """Atama listesi için aktif kullanıcılar (users.view izni gerektirmez)."""
    return service.list_assignees(db)


@router.post("/bulk-status")
def bulk_status(body: schemas.DefectBulkStatus, current=Depends(require_permission("defects.manage")),
                db: Session = Depends(get_db)):
    return service.bulk_status(db, body.ids, body.status, current.id)


@router.post("/bulk-assign")
def bulk_assign(body: schemas.DefectBulkAssign, current=Depends(require_permission("defects.manage")),
                db: Session = Depends(get_db)):
    return service.bulk_assign(db, body.ids, body.assignee_id, current.id)


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


@router.patch("/{defect_id}", response_model=schemas.DefectResponse)
def update_defect(defect_id: int, body: schemas.DefectUpdate,
                  current=Depends(require_permission("defects.manage")), db: Session = Depends(get_db)):
    return service.update_defect(db, defect_id, body, current.id)


@router.delete("/{defect_id}", dependencies=[Depends(require_permission("defects.manage"))])
def delete_defect(defect_id: int, db: Session = Depends(get_db)):
    return service.delete_defect(db, defect_id)


# ── Geçmiş ve yorumlar ────────────────────────────────────────────

@router.get("/{defect_id}/activity", response_model=list[schemas.ActivityResponse],
            dependencies=[Depends(require_permission("defects.view"))])
def activity(defect_id: int, db: Session = Depends(get_db)):
    return service.list_activity(db, defect_id)


@router.post("/{defect_id}/comments", response_model=schemas.ActivityResponse, status_code=201)
def add_comment(defect_id: int, body: schemas.CommentCreate,
                current=Depends(require_permission("defects.manage")), db: Session = Depends(get_db)):
    return service.add_comment(db, defect_id, body.body, current.id)


@router.patch("/{defect_id}/comments/{comment_id}", response_model=schemas.ActivityResponse)
def update_comment(defect_id: int, comment_id: int, body: schemas.CommentCreate,
                   current=Depends(require_permission("defects.manage")), db: Session = Depends(get_db)):
    return service.update_comment(db, defect_id, comment_id, body.body, current)


@router.delete("/{defect_id}/comments/{comment_id}")
def delete_comment(defect_id: int, comment_id: int,
                   current=Depends(require_permission("defects.manage")), db: Session = Depends(get_db)):
    return service.delete_comment(db, defect_id, comment_id, current)
