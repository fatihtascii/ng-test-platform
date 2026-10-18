import json
import shutil
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.secrets import is_masked, mask_value
from . import models, schemas, sync, workspace

DEFAULT_PROFILES = [{"name": "Tümü", "marker": ""}]


def _loads(text, default):
    try:
        v = json.loads(text) if text else default
        return v if v is not None else default
    except (TypeError, ValueError):
        return default


def _get(db: Session, suite_id: int) -> models.AutomationSuite:
    s = db.query(models.AutomationSuite).filter(models.AutomationSuite.id == suite_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Otomasyon deposu bulunamadı.")
    return s


def get_suite(db: Session, suite_id: int) -> models.AutomationSuite:
    return _get(db, suite_id)


def serialize(db: Session, s: models.AutomationSuite, counts: Optional[dict] = None) -> dict:
    if counts is None:
        from app.modules.test_cases.models import TestCase
        counts = {s.id: db.query(func.count(TestCase.id)).filter(TestCase.suite_id == s.id).scalar()}
    return {
        "id": s.id, "name": s.name, "project_id": s.project_id, "project_name": s.project.name if s.project else None,
        "repo_url": s.repo_url, "branch": s.branch, "token": mask_value(s.token) if s.token else None,
        "test_path": s.test_path, "environment_id": s.environment_id,
        "environment_name": s.environment.name if s.environment else None,
        "profiles": _loads(s.profiles, DEFAULT_PROFILES), "workers": s.workers, "timeout_minutes": s.timeout_minutes,
        "sync_status": s.sync_status, "syncing": sync.is_running(s.id), "sync_summary": _loads(s.sync_summary, None),
        "commit_sha": s.commit_sha, "commit_message": s.commit_message, "synced_at": s.synced_at,
        "case_count": counts.get(s.id, 0), "created_at": s.created_at,
    }


def list_suites(db: Session, project_id: Optional[int] = None) -> list[dict]:
    from app.modules.test_cases.models import TestCase
    q = db.query(models.AutomationSuite)
    if project_id is not None:
        q = q.filter(models.AutomationSuite.project_id == project_id)
    suites = q.order_by(models.AutomationSuite.id).all()
    counts = dict(db.query(TestCase.suite_id, func.count(TestCase.id)).filter(TestCase.suite_id.in_([s.id for s in suites]))
                    .group_by(TestCase.suite_id).all()) if suites else {}
    return [serialize(db, s, counts) for s in suites]


def _apply(db: Session, s: models.AutomationSuite, data: schemas.SuiteBase, creating: bool):
    from app.modules.projects.models import Project
    from app.modules.environments.models import Environment
    values = data.model_dump(exclude_unset=True)
    if "repo_url" in values and values["repo_url"] is not None:
        try:
            values["repo_url"] = workspace.validate_repo_url(values["repo_url"])
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        if not creating and values["repo_url"] != s.repo_url and workspace.repo_dir(s.id).exists():
            shutil.rmtree(workspace.repo_dir(s.id), ignore_errors=True)   # başka depo: temiz çek
    if values.get("project_id") is not None and not db.query(Project.id).filter(Project.id == values["project_id"]).first():
        raise HTTPException(status_code=422, detail="Proje bulunamadı.")
    if "token" in values:
        tok = values.pop("token")
        if tok is None or tok == "":
            s.token = None
        elif not is_masked(tok):
            s.token = tok.strip()
    if "profiles" in values:
        profs = values.pop("profiles") or []
        names = [p["name"] for p in profs]
        if len(set(names)) != len(names):
            raise HTTPException(status_code=422, detail="Profil adları benzersiz olmalı.")
        s.profiles = json.dumps(profs or DEFAULT_PROFILES, ensure_ascii=False)
    if "test_path" in values and values["test_path"] is not None:
        tp = values["test_path"].strip().strip("/") or "."
        if ".." in tp.split("/"):
            raise HTTPException(status_code=422, detail="Test klasörü depo dışını gösteremez.")
        values["test_path"] = tp
    for k, v in values.items():
        if v is not None or k == "environment_id":
            setattr(s, k, v.strip() if isinstance(v, str) else v)
    project_id = s.project_id
    if s.environment_id:
        env = db.query(Environment).filter(Environment.id == s.environment_id).first()
        if not env or env.project_id not in (None, project_id):
            raise HTTPException(status_code=422, detail="Seçilen ortam bu projeye ait değil.")


def create_suite(db: Session, data: schemas.SuiteCreate) -> dict:
    s = models.AutomationSuite(name=data.name.strip(), project_id=data.project_id, repo_url="", profiles=json.dumps(DEFAULT_PROFILES))
    _apply(db, s, data, creating=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return serialize(db, s)


def update_suite(db: Session, suite_id: int, data: schemas.SuiteUpdate) -> dict:
    s = _get(db, suite_id)
    if sync.is_running(s.id):
        raise HTTPException(status_code=409, detail="Senkronizasyon sürerken ayarlar değiştirilemez.")
    old_project = s.project_id
    _apply(db, s, data, creating=False)
    if s.project_id != old_project:
        # İçe aktarılmış case'ler de yeni projeye taşınır
        from app.modules.test_cases.models import TestCase
        db.query(TestCase).filter(TestCase.suite_id == s.id).update({TestCase.project_id: s.project_id}, synchronize_session=False)
    db.commit()
    db.refresh(s)
    return serialize(db, s)


def delete_suite(db: Session, suite_id: int, delete_cases: bool) -> dict:
    from app.modules.test_cases.models import TestCase
    s = _get(db, suite_id)
    if sync.is_running(s.id):
        raise HTTPException(status_code=409, detail="Senkronizasyon sürerken silinemez.")
    cases = db.query(TestCase).filter(TestCase.suite_id == s.id)
    n = cases.count()
    if delete_cases:
        for tc in cases.all():
            db.delete(tc)
    else:
        cases.update({TestCase.suite_id: None}, synchronize_session=False)
    db.delete(s)
    db.commit()
    shutil.rmtree(workspace.suite_dir(suite_id), ignore_errors=True)
    return {"message": "Depo bağlantısı kaldırıldı.", "cases": n, "cases_deleted": delete_cases}


def start_sync(db: Session, suite_id: int) -> dict:
    s = _get(db, suite_id)
    if not sync.start(s.id):
        raise HTTPException(status_code=409, detail="Senkronizasyon zaten sürüyor.")
    db.expire_all()
    return sync_state(db, suite_id)


def sync_state(db: Session, suite_id: int) -> dict:
    s = _get(db, suite_id)
    db.refresh(s)
    return {"sync_status": s.sync_status, "syncing": sync.is_running(s.id), "sync_log": s.sync_log,
            "sync_summary": _loads(s.sync_summary, None), "commit_sha": s.commit_sha, "synced_at": s.synced_at}
