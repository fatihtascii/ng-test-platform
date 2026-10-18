"""
Test Runs service.

DÜZELTMELER:
- create_test_run: test_plan_id alanı işleniyor.
- get_test_runs: project_id ve status filtresi eklendi — filtresiz tüm
  koşumları döndürmek büyük projelerde memory sorununa yol açar.
- update_test_run: test_plan_id güncelleme desteği.
- Validation schema'ya taşındı, service sadece iş mantığı içeriyor.
"""
import logging
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

from . import models, schemas
from app.modules.projects.models import Project
from app.modules.test_plans.models import TestPlan
from app.modules.defects.service import sync_run_defect

logger = logging.getLogger("ng-test.test_runs")


# Koşum bitince sonuçlar case'lerin "son sonuç" statüsüne yansır (otomasyon zaten böyle yapıyordu)
_FINISHED_RUN_STATUSES = {"Tamamlandı", "Başarısız"}
_CASE_STATUS_BY_RESULT = {"Passed": "Başarılı", "Başarılı": "Başarılı", "Failed": "Başarısız", "Başarısız": "Başarısız"}


def sync_case_statuses(db: Session, run) -> int:
    if run.status not in _FINISHED_RUN_STATUSES:
        return 0
    import json
    from app.modules.test_cases.models import TestCase
    try:
        results = json.loads(run.results or "[]")
    except (TypeError, ValueError):
        return 0
    wanted = {}
    for r in results if isinstance(results, list) else []:
        if not isinstance(r, dict):
            continue
        cid = r.get("case_id") or r.get("test_case_id")
        new = _CASE_STATUS_BY_RESULT.get(r.get("status") or r.get("run_status"))
        if isinstance(cid, int) and new:
            wanted[cid] = new
    if not wanted:
        return 0
    cases = db.query(TestCase).filter(TestCase.id.in_(wanted), TestCase.project_id == run.project_id).all()
    for tc in cases:
        tc.status = wanted[tc.id]
    return len(cases)


def _get_or_404(db: Session, run_id: int) -> models.TestRun:
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Test koşumu bulunamadı.")
    return run


def create_test_run(db: Session, run: schemas.TestRunCreate) -> models.TestRun:
    # Proje kontrolü
    if not db.query(Project).filter(Project.id == run.project_id).first():
        raise HTTPException(status_code=404, detail="Bağlı proje bulunamadı.")

    # FIX: test_plan_id varsa plan kontrolü yap
    if run.test_plan_id is not None:
        plan = db.query(TestPlan).filter(TestPlan.id == run.test_plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Bağlı test planı bulunamadı.")
        # Plan başka bir projeye ait ise hata ver
        if plan.project_id != run.project_id:
            raise HTTPException(
                status_code=400,
                detail="Test planı seçilen projeye ait değil.",
            )

    db_run = models.TestRun(**run.model_dump())
    db.add(db_run)
    db.flush()
    sync_run_defect(db, db_run)   # başarısız sonuç varsa otomatik defect
    sync_case_statuses(db, db_run)
    db.commit()
    db.refresh(db_run)
    logger.info(f"TestRun oluşturuldu: id={db_run.id} name={db_run.name!r}")
    return db_run


def get_test_runs(
    db: Session,
    project_id: Optional[int] = None,
    status:     Optional[str] = None,
    is_defect:  Optional[bool] = None,
    skip:       int = 0,
    limit:      int = 200,
) -> list[models.TestRun]:
    """
    FIX: project_id ve status filtresi eklendi.
    Frontend proje bazlı gösteriyor, filtresiz sorgu büyük DB'de yavaşlar.
    """
    q = db.query(models.TestRun)

    if project_id is not None:
        q = q.filter(models.TestRun.project_id == project_id)
    if status is not None:
        q = q.filter(models.TestRun.status == status)
    if is_defect is not None:
        q = q.filter(models.TestRun.is_defect == is_defect)

    return (
        q.order_by(models.TestRun.id.desc())
         .offset(skip)
         .limit(limit)
         .all()
    )


def get_test_run_by_id(db: Session, run_id: int) -> models.TestRun:
    return _get_or_404(db, run_id)


def update_test_run(
    db: Session,
    run_id: int,
    data: schemas.TestRunCreate,
) -> models.TestRun:
    run = _get_or_404(db, run_id)

    # Proje değişiyorsa kontrol et
    if data.project_id != run.project_id:
        if not db.query(Project).filter(Project.id == data.project_id).first():
            raise HTTPException(status_code=404, detail="Bağlı proje bulunamadı.")

    # FIX: test_plan_id değişiyorsa plan kontrolü
    if data.test_plan_id is not None and data.test_plan_id != run.test_plan_id:
        plan = db.query(TestPlan).filter(TestPlan.id == data.test_plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Bağlı test planı bulunamadı.")
        if plan.project_id != data.project_id:
            raise HTTPException(
                status_code=400,
                detail="Test planı seçilen projeye ait değil.",
            )

    values = data.model_dump()
    # İstekte gönderilmediyse defect işaretini koru (frontend PUT'larında bu alan yok)
    if "is_defect" not in data.model_fields_set:
        values.pop("is_defect")
    for k, v in values.items():
        setattr(run, k, v)

    sync_run_defect(db, run)
    sync_case_statuses(db, run)
    db.commit()
    db.refresh(run)
    logger.info(f"TestRun güncellendi: id={run_id}")
    return run


def delete_test_run(db: Session, run_id: int) -> dict:
    run = _get_or_404(db, run_id)
    db.delete(run)
    db.commit()
    logger.info(f"TestRun silindi: id={run_id}")
    return {"message": "Test koşumu silindi."}