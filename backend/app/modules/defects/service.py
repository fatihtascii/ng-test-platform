"""
Defect servisi.

Otomatik defect'ler sync_run_defect() ile üretilir: bir koşumun results
alanında başarısız case varsa o koşuma bağlı tek bir "auto" defect oluşturulur
veya güncellenir. Statü kullanıcıya aittir; yalnızca çözülmüş (Resolved) bir
defect'e yeni hata gelirse tekrar "Open" yapılır.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from . import models, schemas
from app.modules.projects.models import Project
from app.modules.test_cases.models import TestCase
from app.modules.users.models import User

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


def _name(u) -> Optional[str]:
    return (u.full_name or u.username) if u else None


def serialize(d: models.Defect, comment_count: int = 0) -> dict:
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
        "created_by_name": _name(d.author),
        "assignee_id":    d.assignee_id,
        "assignee_name":  _name(d.assignee),
        "comment_count":  comment_count,
        "resolved_at":    d.resolved_at,
        "created_at":     d.created_at,
        "updated_at":     d.updated_at,
    }


def _query(db: Session):
    return db.query(models.Defect).options(
        joinedload(models.Defect.project),
        joinedload(models.Defect.test_run),
        joinedload(models.Defect.author),
        joinedload(models.Defect.assignee),
    )


def _comment_counts(db: Session, ids) -> dict[int, int]:
    if not ids:
        return {}
    A = models.DefectActivity
    rows = (db.query(A.defect_id, func.count(A.id))
              .filter(A.kind == "comment", A.defect_id.in_(list(ids)))
              .group_by(A.defect_id).all())
    return dict(rows)


def _get_or_404(db: Session, defect_id: int) -> models.Defect:
    d = _query(db).filter(models.Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect bulunamadı.")
    return d


def _assert_project(db: Session, project_id: int):
    if not db.query(Project.id).filter(Project.id == project_id).first():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")


def _assignee_or_400(db: Session, user_id: Optional[int]) -> Optional[User]:
    if user_id is None:
        return None
    u = db.query(User).filter(User.id == user_id).first()
    if not u or not u.is_active:
        raise HTTPException(status_code=400, detail="Atanacak kullanıcı bulunamadı veya devre dışı.")
    return u


def _log(db: Session, d: models.Defect, kind: str, user_id: Optional[int],
         from_value=None, to_value=None, body: Optional[str] = None):
    db.add(models.DefectActivity(
        defect_id=d.id, user_id=user_id, kind=kind, body=body,
        from_value=None if from_value is None else str(from_value)[:200],
        to_value=None if to_value is None else str(to_value)[:200],
    ))


def _set_status(d: models.Defect, status: str):
    if status == d.status:
        return
    d.status = status
    d.resolved_at = datetime.now(timezone.utc) if status == "Resolved" else None


# ── CRUD ──────────────────────────────────────────────────────────

def list_defects(db: Session, project_id: Optional[int] = None, status: Optional[str] = None,
                 severity: Optional[str] = None, test_run_id: Optional[int] = None,
                 assignee_id: Optional[int] = None, unassigned: bool = False) -> list[dict]:
    q = _query(db)
    if project_id is not None:
        q = q.filter(models.Defect.project_id == project_id)
    if status is not None:
        q = q.filter(models.Defect.status == status)
    if severity is not None:
        q = q.filter(models.Defect.severity == severity)
    if test_run_id is not None:
        q = q.filter(models.Defect.test_run_id == test_run_id)
    if unassigned:
        q = q.filter(models.Defect.assignee_id.is_(None))
    elif assignee_id is not None:
        q = q.filter(models.Defect.assignee_id == assignee_id)
    items = q.order_by(models.Defect.id.desc()).all()
    counts = _comment_counts(db, {d.id for d in items})
    return [serialize(d, counts.get(d.id, 0)) for d in items]


def get_defect(db: Session, defect_id: int) -> dict:
    d = _get_or_404(db, defect_id)
    return serialize(d, _comment_counts(db, {d.id}).get(d.id, 0))


def list_assignees(db: Session) -> list[dict]:
    users = db.query(User).filter(User.is_active.is_(True)).order_by(User.full_name, User.username).all()
    return [{"id": u.id, "username": u.username, "full_name": u.full_name, "role": u.role} for u in users]


def create_defect(db: Session, data: schemas.DefectCreate, user_id: Optional[int]) -> dict:
    _assert_project(db, data.project_id)
    assignee = _assignee_or_400(db, data.assignee_id)
    details = [fd.model_dump() for fd in data.failed_details]
    if data.test_case_id and not details:
        tc = db.query(TestCase).filter(TestCase.id == data.test_case_id).first()
        if tc:
            details = [{"case_id": tc.id, "title": tc.title, "error": None, "severity": tc.priority}]
    d = models.Defect(
        title=data.title, description=data.description, severity=data.severity,
        status=data.status, source="manual", project_id=data.project_id,
        test_run_id=data.test_run_id, test_case_id=data.test_case_id,
        failed_details=json.dumps(details, ensure_ascii=False), created_by=user_id,
        assignee_id=assignee.id if assignee else None,
        resolved_at=datetime.now(timezone.utc) if data.status == "Resolved" else None,
    )
    db.add(d)
    db.flush()
    _log(db, d, "created", user_id)
    if assignee:
        _log(db, d, "assignee", user_id, None, _name(assignee))
    db.commit()
    return get_defect(db, d.id)


def update_defect(db: Session, defect_id: int, data: schemas.DefectUpdate, user_id: Optional[int] = None) -> dict:
    d = _get_or_404(db, defect_id)
    values = data.model_dump(exclude_unset=True)
    if "project_id" in values and values["project_id"] != d.project_id:
        _assert_project(db, values["project_id"])
    if values.get("title") is None:
        values.pop("title", None)
    for key in ("status", "severity", "project_id"):
        if key in values and values[key] is None:
            values.pop(key)

    if "status" in values and values["status"] != d.status:
        _log(db, d, "status", user_id, d.status, values["status"])
        _set_status(d, values.pop("status"))
    values.pop("status", None)
    if "severity" in values and values["severity"] != d.severity:
        _log(db, d, "severity", user_id, d.severity, values["severity"])
    if "title" in values and values["title"] != d.title:
        _log(db, d, "title", user_id, d.title, values["title"])
    if "assignee_id" in values:
        new_id = values.pop("assignee_id")
        if new_id != d.assignee_id:
            assignee = _assignee_or_400(db, new_id)
            _log(db, d, "assignee", user_id, _name(d.assignee), _name(assignee))
            d.assignee_id = new_id
    for k, v in values.items():
        setattr(d, k, v)
    db.commit()
    db.expire_all()
    return get_defect(db, defect_id)


def _bulk(db: Session, ids: list[int], apply) -> int:
    items = _query(db).filter(models.Defect.id.in_(set(ids))).all()
    changed = sum(1 for d in items if apply(d))
    db.commit()
    return changed


def bulk_status(db: Session, ids: list[int], status: str, user_id: Optional[int] = None) -> dict:
    def apply(d):
        if d.status == status:
            return False
        _log(db, d, "status", user_id, d.status, status)
        _set_status(d, status)
        return True
    return {"updated": _bulk(db, ids, apply), "status": status}


def bulk_assign(db: Session, ids: list[int], assignee_id: Optional[int], user_id: Optional[int] = None) -> dict:
    assignee = _assignee_or_400(db, assignee_id)

    def apply(d):
        if d.assignee_id == assignee_id:
            return False
        _log(db, d, "assignee", user_id, _name(d.assignee), _name(assignee))
        d.assignee_id = assignee_id
        return True
    return {"updated": _bulk(db, ids, apply), "assignee_id": assignee_id}


def delete_defect(db: Session, defect_id: int) -> dict:
    d = _get_or_404(db, defect_id)
    db.delete(d)
    db.commit()
    return {"message": "Defect silindi."}


# ── Geçmiş ve yorumlar ────────────────────────────────────────────

def _activity_dict(a: models.DefectActivity) -> dict:
    return {
        "id": a.id, "kind": a.kind, "body": a.body, "from_value": a.from_value, "to_value": a.to_value,
        "user_id": a.user_id, "user_name": _name(a.user), "created_at": a.created_at, "updated_at": a.updated_at,
    }


def list_activity(db: Session, defect_id: int) -> list[dict]:
    _get_or_404(db, defect_id)
    A = models.DefectActivity
    rows = (db.query(A).options(joinedload(A.user))
              .filter(A.defect_id == defect_id).order_by(A.created_at, A.id).all())
    return [_activity_dict(a) for a in rows]


def add_comment(db: Session, defect_id: int, body: str, user_id: int) -> dict:
    d = _get_or_404(db, defect_id)
    a = models.DefectActivity(defect_id=d.id, user_id=user_id, kind="comment", body=body)
    db.add(a)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return _activity_dict(a)


def _comment_or_404(db: Session, defect_id: int, comment_id: int) -> models.DefectActivity:
    a = (db.query(models.DefectActivity)
           .filter(models.DefectActivity.id == comment_id, models.DefectActivity.defect_id == defect_id,
                   models.DefectActivity.kind == "comment").first())
    if not a:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı.")
    return a


def update_comment(db: Session, defect_id: int, comment_id: int, body: str, user) -> dict:
    a = _comment_or_404(db, defect_id, comment_id)
    if a.user_id != user.id:
        raise HTTPException(status_code=403, detail="Yalnızca kendi yorumunuzu düzenleyebilirsiniz.")
    a.body = body
    a.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return _activity_dict(a)


def delete_comment(db: Session, defect_id: int, comment_id: int, user) -> dict:
    a = _comment_or_404(db, defect_id, comment_id)
    if a.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Yalnızca kendi yorumunuzu silebilirsiniz.")
    db.delete(a)
    db.commit()
    return {"message": "Yorum silindi."}


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
            if existing.status == "Resolved":   # çözüldü denmişti ama hata tekrarladı
                _log(db, existing, "reopened", None, "Resolved", "Open",
                     body=f"{run.name or 'Koşum'} yeniden {len(details)} hatalı test raporladı.")
                _set_status(existing, "Open")
        return existing

    d = models.Defect(
        title=title, severity=severity, status="Open", source="auto",
        project_id=run.project_id, test_run_id=run.id, failed_details=payload,
    )
    db.add(d)
    db.flush()
    _log(db, d, "created", None, body=f"{run.name or 'Koşum'} {len(details)} hatalı test raporladı.")
    logger.info(f"Otomatik defect oluşturuldu: run={run.id} hatalı={len(details)}")
    return d
