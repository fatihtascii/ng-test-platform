"""
Entegrasyon ayarları: kayıt, maskeleme, doğrulama, bağlantı testi ve gönderim geçmişi.
Bildirim/aktarım mantığı notify.py'de, GitHub tetiklemesi github.py'de.
"""
import json
import logging
import os
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.secrets import mask_value, is_masked
from . import clients, models, schemas

logger = logging.getLogger("ng-test.integrations")

PROVIDERS = ("slack", "jira", "github")
SECRET_KEYS = {"slackWebhook", "jiraToken", "githubToken", "githubSecret"}

# Bilinen alanlar ve varsayılanları; bilinmeyen alanlar kaydedilmez
DEFAULTS = {
    "slack":  {"slackWebhook": "", "slackChannel": "", "notifyOn": "failures", "notifyDefects": True},
    "jira":   {"jiraUrl": "", "jiraEmail": "", "jiraToken": "", "jiraProjectKey": "", "jiraIssueType": "Bug", "autoCreate": False},
    "github": {"githubRepo": "", "githubBranch": "main", "githubToken": "", "githubSecret": "",
               "projectId": None, "environmentId": None, "triggerOn": "push", "reportStatus": True},
}
CHOICES = {"notifyOn": ("failures", "all", "never"), "triggerOn": ("push", "deployment")}


def app_url() -> str:
    return os.getenv("APP_URL", "http://localhost:3000").rstrip("/")


def _assert_provider(provider: str):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Bilinmeyen entegrasyon: {provider}")


def _row(db: Session, provider: str) -> Optional[models.Integration]:
    return db.query(models.Integration).filter(models.Integration.provider == provider).first()


def stored(db: Session, provider: str) -> tuple[bool, dict]:
    """(aktif mi, varsayılanlarla birleştirilmiş gerçek ayarlar)"""
    row = _row(db, provider)
    cfg = (row.config if row else None) or {}
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except json.JSONDecodeError:
            cfg = {}
    return bool(row and row.is_active), {**DEFAULTS[provider], **{k: v for k, v in cfg.items() if k in DEFAULTS[provider]}}


def _public(provider: str, active: bool, cfg: dict, row_id=None, updated_at=None) -> dict:
    return {
        "id": row_id, "provider": provider, "is_active": active,
        "config": {k: (mask_value(v) if k in SECRET_KEYS and v else v) for k, v in cfg.items()},
        "configured": _configured(provider, cfg),
        "updated_at": updated_at,
    }


def _configured(provider: str, cfg: dict) -> bool:
    if provider == "slack":
        return bool(cfg.get("slackWebhook"))
    if provider == "jira":
        return all(cfg.get(k) for k in ("jiraUrl", "jiraEmail", "jiraToken", "jiraProjectKey"))
    return bool(cfg.get("githubRepo") and cfg.get("githubToken"))


def get_integration(db: Session, provider: str) -> dict:
    _assert_provider(provider)
    row = _row(db, provider)
    active, cfg = stored(db, provider)
    return _public(provider, active, cfg, row.id if row else None, row.updated_at if row else None)


def get_all(db: Session) -> list[dict]:
    return [get_integration(db, p) for p in PROVIDERS]


def status(db: Session) -> dict:
    """Herkesin görebileceği özet: hangi entegrasyon açık ve kullanılabilir."""
    out = {}
    for p in PROVIDERS:
        active, cfg = stored(db, p)
        out[p] = active and _configured(p, cfg)
    return out


def merge_incoming(db: Session, provider: str, incoming: Optional[dict]) -> dict:
    """İstemciden gelen ayarı kayıtlıyla birleştirir; maskeli sır = değişmedi."""
    _, current = stored(db, provider)
    merged = dict(current)
    for k, v in (incoming or {}).items():
        if k not in DEFAULTS[provider]:
            continue
        if k in SECRET_KEYS and is_masked(v):
            continue
        if isinstance(v, str):
            v = v.strip()
        if k in CHOICES and v not in CHOICES[k]:
            raise HTTPException(status_code=422, detail=f"Geçersiz değer: {k}={v!r}")
        merged[k] = v
    if provider == "jira" and merged.get("jiraUrl"):
        merged["jiraUrl"] = merged["jiraUrl"].rstrip("/")
    if provider == "jira" and merged.get("jiraProjectKey"):
        merged["jiraProjectKey"] = merged["jiraProjectKey"].upper()
    return merged


def _validate(db: Session, provider: str, cfg: dict):
    if provider == "slack" and cfg["slackWebhook"] and not cfg["slackWebhook"].startswith("https://"):
        raise HTTPException(status_code=422, detail="Slack webhook adresi https:// ile başlamalı.")
    if provider == "jira" and cfg["jiraUrl"] and not cfg["jiraUrl"].startswith("https://"):
        raise HTTPException(status_code=422, detail="Jira adresi https:// ile başlamalı.")
    if provider == "github":
        if cfg["githubRepo"] and cfg["githubRepo"].count("/") != 1:
            raise HTTPException(status_code=422, detail="GitHub deposu 'sahip/depo' biçiminde olmalı.")
        from app.modules.projects.models import Project
        from app.modules.environments.models import Environment
        if cfg.get("projectId") not in (None, ""):
            if not db.query(Project.id).filter(Project.id == int(cfg["projectId"])).first():
                raise HTTPException(status_code=422, detail="Seçilen proje bulunamadı.")
            cfg["projectId"] = int(cfg["projectId"])
        else:
            cfg["projectId"] = None
        if cfg.get("environmentId") not in (None, ""):
            env = db.query(Environment).filter(Environment.id == int(cfg["environmentId"])).first()
            if not env or (cfg["projectId"] and env.project_id not in (None, cfg["projectId"])):
                raise HTTPException(status_code=422, detail="Seçilen ortam bu projeye ait değil.")
            cfg["environmentId"] = int(cfg["environmentId"])
        else:
            cfg["environmentId"] = None


def upsert(db: Session, provider: str, data: schemas.IntegrationUpsert) -> dict:
    _assert_provider(provider)
    cfg = merge_incoming(db, provider, data.config)
    _validate(db, provider, cfg)
    if data.is_active and not _configured(provider, cfg):
        raise HTTPException(status_code=422, detail="Entegrasyonu açmadan önce zorunlu alanları doldurun.")
    if provider == "github" and data.is_active and not cfg["githubSecret"]:
        raise HTTPException(status_code=422, detail="Webhook isteklerini doğrulamak için bir webhook secret girin.")
    row = _row(db, provider)
    if row:
        row.is_active, row.config = data.is_active, cfg
    else:
        row = models.Integration(provider=provider, is_active=data.is_active, config=cfg)
        db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(f"Entegrasyon kaydedildi: {provider} aktif={data.is_active}")
    return get_integration(db, provider)


def test_connection(db: Session, provider: str, incoming: Optional[dict]) -> dict:
    """Kaydetmeden, formdaki (sırlar maskeliyse kayıtlı) ayarlarla bağlantıyı dener."""
    _assert_provider(provider)
    cfg = merge_incoming(db, provider, incoming)
    try:
        if provider == "slack":
            clients.slack_post(cfg, "✅ NG Test bağlantı denemesi: bu kanal koşum bildirimlerini alacak.")
            msg = "Slack'e deneme mesajı gönderildi."
        elif provider == "jira":
            who = clients.jira_check(cfg)
            msg = f"Jira bağlantısı kuruldu ({who})" + (f", {cfg['jiraProjectKey']} projesi erişilebilir." if cfg.get("jiraProjectKey") else ".")
        else:
            repo = clients.github_check(cfg)
            msg = f"GitHub deposuna erişildi: {repo}."
    except clients.IntegrationError as e:
        log_event(db, provider, "test", False, str(e))
        raise HTTPException(status_code=e.status if e.status in (401, 404, 422) else 502, detail=str(e))
    log_event(db, provider, "test", True, msg)
    return {"success": True, "message": msg}


# ── Gönderim geçmişi ──────────────────────────────────────────────

def log_event(db: Session, provider: str, event: str, ok: bool, message: str, ref: Optional[str] = None):
    db.add(models.IntegrationEvent(provider=provider, event=event, ok=ok, message=(message or "")[:2000], ref=ref))
    db.commit()
    # Tablo büyümesin: sağlayıcı başına son 200 kayıt
    old = (db.query(models.IntegrationEvent.id).filter(models.IntegrationEvent.provider == provider)
             .order_by(models.IntegrationEvent.id.desc()).offset(200).all())
    if old:
        db.query(models.IntegrationEvent).filter(models.IntegrationEvent.id.in_([o.id for o in old])).delete(synchronize_session=False)
        db.commit()


def list_events(db: Session, provider: str, limit: int = 20) -> list[models.IntegrationEvent]:
    _assert_provider(provider)
    return (db.query(models.IntegrationEvent).filter(models.IntegrationEvent.provider == provider)
              .order_by(models.IntegrationEvent.id.desc()).limit(limit).all())
