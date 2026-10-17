"""
Defect servisi.

Otomatik defect'ler sync_run_defect() ile üretilir: bir koşumun results
alanında başarısız case varsa o koşuma bağlı tek bir "auto" defect oluşturulur
veya güncellenir. Statü kullanıcıya aittir; yalnızca çözülmüş (Resolved) bir
defect'e yeni hata gelirse tekrar "Open" yapılır.
"""
import json
import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from . import models, schemas
from app.modules.projects.models import Project
from app.modules.test_cases.models import TestCase

logger = logging.getLogger("ng-test.defects")

FAILED_VALUES = {"Failed", "Başarısız"}
SEVERITY_ORDER = {"Düşük": 1, "Orta": 2, "Yüksek": 3, "Kritik": 4}


def _loads(text) -> list:
    if isinstance(text, list):
        return text
    try:
        value = json.loads(text or "[]")
        return value if isinstance(value, list) else []
    except (TypeError, json.JSONDecodeError):
        return []


def serialize(d: models.Defect) -> dict:
    details = _loads(d.failed_details)
    return {
        "id":             d.id,
        "code":           f"BUG-{d.id}",
        "title":          d.title,
        "description":    d.description,
        "severity":       d.severity,
        "status":         d.status,
        "source":         d.source,
        "project_id":     d.project_id,
        "project_name":   d.project.name if d.project else None,
        "test_run_id":    d.test_run_id,
        "test_run_name":  d.test_run.name if d.test_run else None,
        "test_case_id":   d.test_case_id,
        "failed_details": details,
        "failed_count":   len(details),
        "created_by":     d.created_by,
        "created_by_name": (d.author.full_name or d.author.username) if d.author else None,
        "created_at":     d.created_at,
        "updated_at":     d.updated_at,
    }


def _query(db: Session):
    return db.query(models.Defect).options(
        joinedload(models.Defect.project),
        joinedload(models.Defect.test_run),
        joinedload(models.Defect.author),
    )


def _get_or_404(db: Session, defect_id: int) -> models.Defect:
    d = _query(db).filter(models.Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect bulunamadı.")
    return d


def _assert_project(db: Session, project_id: int):
    if not db.query(Project.id).filter(Project.id == project_id).first():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")


# ── CRUD ──────────────────────────────────────────────────────────

def list_defects(db: Session, project_id: Optional[int] = None, status: Optional[str] = None,
                 severity: Optional[str] = None, test_run_id: Optional[int] = None) -> list[dict]:
    q = _query(db)
    if project_id is not None:
        q = q.filter(models.Defect.project_id == project_id)
    if status is not None:
        q = q.filter(models.Defect.status == status)
    if severity is not None:
        q = q.filter(models.Defect.severity == severity)
    if test_run_id is not None:
        q = q.filter(models.Defect.test_run_id == test_run_id)
    return [serialize(d) for d in q.order_by(models.Defect.id.desc()).all()]


def get_defect(db: Session, defect_id: int) -> dict:
    return serialize(_get_or_404(db, defect_id))


def create_defect(db: Session, data: schemas.DefectCreate, user_id: Optional[int]) -> dict:
    _assert_project(db, data.project_id)
    details = [fd.model_dump() for fd in data.failed_details]
    if data.test_case_id and not details:
        tc = db.query(TestCase).filter(TestCase.id == data.test_case_id).first()
        if tc:
            details = [{"case_id": tc.id, "title": tc.title, "error": data.description, "severity": tc.priority}]
    d = models.Defect(
        title=data.title, description=data.description, severity=data.severity,
        status=data.status, source="manual", project_id=data.project_id,
        test_run_id=data.test_run_id, test_case_id=data.test_case_id,
        failed_details=json.dumps(details, ensure_ascii=False), created_by=user_id,
    )
    db.add(d)
    db.commit()
    return get_defect(db, d.id)


def update_defect(db: Session, defect_id: int, data: schemas.DefectUpdate) -> dict:
    d = _get_or_404(db, defect_id)
    values = data.model_dump(exclude_unset=True)
    if "project_id" in values and values["project_id"] != d.project_id:
        _assert_project(db, values["project_id"])
    if "title" in values:
        if not (values["title"] or "").strip():
            raise HTTPException(status_code=400, detail="Başlık boş olamaz.")
        values["title"] = values["title"].strip()
    for k, v in values.items():
        setattr(d, k, v)
    db.commit()
    return get_defect(db, defect_id)


def bulk_status(db: Session, ids: list[int], status: str) -> dict:
    n = (db.query(models.Defect)
           .filter(models.Defect.id.in_(set(ids)))
           .update({"status": status}, synchronize_session=False))
    db.commit()
    return {"updated": n, "status": status}


def delete_defect(db: Session, defect_id: int) -> dict:
    d = _get_or_404(db, defect_id)
    db.delete(d)
    db.commit()
    return {"message": "Defect silindi."}


# ── Koşumdan otomatik defect ──────────────────────────────────────

def failed_details_from_results(db: Session, results_text) -> list[dict]:
    items = [r for r in _loads(results_text)
             if isinstance(r, dict) and (r.get("status") in FAILED_VALUES or r.get("run_status") in FAILED_VALUES)]
    case_ids = {r.get("case_id") or r.get("test_case_id") for r in items} - {None}
    cases = {c.id: c for c in db.query(TestCase).filter(TestCase.id.in_(case_ids)).all()} if case_ids else {}
    details = []
    for idx, r in enumerate(items):
        cid = r.get("case_id") or r.get("test_case_id")
        tc = cases.get(cid)
        details.append({
            "case_id":  cid,
            "title":    (tc.title if tc else None) or r.get("test_case_title") or (f"Test #{cid}" if cid else f"Test {idx + 1}"),
            "error":    r.get("actual_result") or r.get("error") or r.get("note"),
            "severity": (tc.priority if tc else None) or r.get("test_case_priority") or "Orta",
        })
    return details


def sync_run_defect(db: Session, run) -> Optional[models.Defect]:
    """Koşumun başarısız sonuçlarını otomatik defect'e yansıtır. Commit çağırana aittir."""
    details = failed_details_from_results(db, run.results)
    existing = (db.query(models.Defect)
                  .filter(models.Defect.test_run_id == run.id, models.Defect.source == "auto")
                  .first())
    if not details:
        return existing  # hata yoksa mevcut kayda (ve kullanıcının verdiği statüye) dokunma

    severity = max((d["severity"] for d in details), key=lambda s: SEVERITY_ORDER.get(s, 2))
    title = f"{run.name or 'İsimsiz Koşum'} — {len(details)} hatalı test"
    payload = json.dumps(details, ensure_ascii=False)

    if existing:
        if existing.failed_details != payload:
            existing.failed_details = payload
            existing.title = title
            existing.severity = severity
            if existing.status == "Resolved":
                existing.status = "Open"   # çözüldü denmişti ama hata tekrarladı
        return existing

    d = models.Defect(
        title=title, severity=severity, status="Open", source="auto",
        project_id=run.project_id, test_run_id=run.id, failed_details=payload,
    )
    db.add(d)
    logger.info(f"Otomatik defect oluşturuldu: run={run.id} hatalı={len(details)}")
    return d
