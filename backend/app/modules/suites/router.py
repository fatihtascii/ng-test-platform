"""Otomasyon depoları: bağla, senkronize et (çek + kur + keşfet + içe aktar), durumu izle."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from . import schemas, service

router = APIRouter(prefix="/suites", tags=["Automation suites"])


@router.get("/", response_model=list[schemas.SuiteResponse], dependencies=[Depends(require_permission("automation.view"))])
def list_suites(db: Session = Depends(get_db), project_id: Optional[int] = Query(None)):
    return service.list_suites(db, project_id)


@router.post("/", response_model=schemas.SuiteResponse, status_code=201, dependencies=[Depends(require_permission("automation.manage"))])
def create_suite(body: schemas.SuiteCreate, db: Session = Depends(get_db)):
    return service.create_suite(db, body)


@router.get("/{suite_id}", response_model=schemas.SuiteResponse, dependencies=[Depends(require_permission("automation.view"))])
def get_suite(suite_id: int, db: Session = Depends(get_db)):
    return service.serialize(db, service.get_suite(db, suite_id))


@router.patch("/{suite_id}", response_model=schemas.SuiteResponse, dependencies=[Depends(require_permission("automation.manage"))])
def update_suite(suite_id: int, body: schemas.SuiteUpdate, db: Session = Depends(get_db)):
    return service.update_suite(db, suite_id, body)


@router.delete("/{suite_id}", dependencies=[Depends(require_permission("automation.manage"))])
def delete_suite(suite_id: int, db: Session = Depends(get_db), delete_cases: bool = Query(False)):
    return service.delete_suite(db, suite_id, delete_cases)


@router.post("/{suite_id}/sync", response_model=schemas.SyncState, status_code=202, dependencies=[Depends(require_permission("automation.manage"))])
def start_sync(suite_id: int, db: Session = Depends(get_db)):
    return service.start_sync(db, suite_id)


@router.get("/{suite_id}/sync", response_model=schemas.SyncState, dependencies=[Depends(require_permission("automation.view"))])
def sync_state(suite_id: int, db: Session = Depends(get_db)):
    return service.sync_state(db, suite_id)
