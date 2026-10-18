"""
Proje servisi. İstatistikler (case/plan/koşum/hata sayıları) gruplanmış sorgularla
tek seferde hesaplanır; proje sayısından bağımsız olarak sabit sayıda sorgu çalışır.
"""
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models, schemas
from app.modules.test_cases.models import TestCase
from app.modules.test_plans.models import TestPlan
from app.modules.test_runs.models import TestRun
from app.modules.defects.models import Defect
from app.modules.environments.models import Environment

ACTIVE_DEFECT = ("Open", "In Progress", "Re-test")


def _stats(db: Session, ids: list[int]) -> dict[int, dict]:
    out = {pid: schemas.ProjectStats().model_dump() for pid in ids}
    if not ids:
        return out
    for pid, status, n in (db.query(TestCase.project_id, TestCase.status, func.count(TestCase.id))
                             .filter(TestCase.project_id.in_(ids)).group_by(TestCase.project_id, TestCase.status)):
        out[pid]["cases"] += n
        out[pid]["cases_by_status"][status] = n
    for pid, n in (db.query(TestCase.project_id, func.count(TestCase.id))
                     .filter(TestCase.project_id.in_(ids), TestCase.execution_type == "Automated").group_by(TestCase.project_id)):
        out[pid]["automated"] = n
    for pid, status, n in (db.query(TestPlan.project_id, TestPlan.status, func.count(TestPlan.id))
                             .filter(TestPlan.project_id.in_(ids)).group_by(TestPlan.project_id, TestPlan.status)):
        out[pid]["plans"] += n
        if status != "Tamamlandı":
            out[pid]["active_plans"] += n
    for pid, n, last in (db.query(TestRun.project_id, func.count(TestRun.id), func.max(TestRun.created_at))
                           .filter(TestRun.project_id.in_(ids), TestRun.is_defect.is_(False)).group_by(TestRun.project_id)):
        out[pid]["runs"] = n
        out[pid]["last_run_at"] = last
    for pid, sev, n in (db.query(Defect.project_id, Defect.severity, func.count(Defect.id))
                          .filter(Defect.project_id.in_(ids), Defect.status.in_(ACTIVE_DEFECT))
                          .group_by(Defect.project_id, Defect.severity)):
        out[pid]["open_defects"] += n
        if sev == "Kritik":
            out[pid]["critical_defects"] += n
    for pid, n in (db.query(Environment.project_id, func.count(Environment.id))
                     .filter(Environment.project_id.in_(ids)).group_by(Environment.project_id)):
        out[pid]["environments"] = n
    return out


def _with_stats(db: Session, projects: list) -> list[dict]:
    stats = _stats(db, [p.id for p in projects])
    return [{**schemas.ProjectResponse.model_validate(p).model_dump(exclude={"stats"}), "stats": stats[p.id]} for p in projects]


def get_projects(db: Session, with_stats: bool = False):
    projects = db.query(models.Project).order_by(models.Project.id).all()
    return _with_stats(db, projects) if with_stats else projects


def get_project_by_id(db: Session, project_id: int):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")
    return project


def get_project(db: Session, project_id: int, with_stats: bool = False):
    project = get_project_by_id(db, project_id)
    return _with_stats(db, [project])[0] if with_stats else project


def _norm(name: str) -> str:
    # Türkçe büyük/küçük harf: İ→i, I→ı; ardından casefold
    return name.replace("İ", "i").replace("I", "ı").casefold()


def _assert_unique(db: Session, name: str, exclude_id: int | None = None):
    target = _norm(name)
    for pid, existing in db.query(models.Project.id, models.Project.name):
        if pid != exclude_id and _norm(existing) == target:
            raise HTTPException(status_code=409, detail=f"'{name}' adında bir proje zaten var.")


def create_project(db: Session, project: schemas.ProjectCreate):
    _assert_unique(db, project.name)
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


def update_project(db: Session, project_id: int, project_data: schemas.ProjectUpdate):
    project = get_project_by_id(db, project_id)
    values = project_data.model_dump(exclude_unset=True)
    for key in ("name", "status"):
        if key in values and values[key] is None:
            values.pop(key)
    if "name" in values and values["name"] != project.name:
        _assert_unique(db, values["name"], exclude_id=project_id)
    for k, v in values.items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: int):
    project = get_project_by_id(db, project_id)
    # Hata kayıtları ORM ilişkisinde değil; FK'ler kapalı olsa bile yetim kalmasınlar
    db.query(Defect).filter(Defect.project_id == project_id).delete(synchronize_session=False)
    db.delete(project)
    db.commit()
    return {"message": "Proje silindi."}
