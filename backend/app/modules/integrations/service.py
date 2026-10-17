import logging
import json # 🚀 FIX: json kütüphanesini tekrar import ediyoruz
from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas
from app.core.secrets import mask_value, is_masked

logger = logging.getLogger("ng-test.integrations")

_PROVIDERS = ("slack", "jira", "github")

# Yanıtlarda asla açık dönmeyen alanlar
SECRET_KEYS = {"slackWebhook", "jiraToken", "githubToken", "githubSecret"}


def _mask_config(config: dict) -> dict:
    return {k: (mask_value(v) if k in SECRET_KEYS else v) for k, v in (config or {}).items()}


def _stored_config(db: Session, provider: str) -> dict:
    row = db.query(models.Integration).filter(models.Integration.provider == provider).first()
    cfg = (row.config if row else None) or {}
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except json.JSONDecodeError:
            cfg = {}
    return cfg


def resolve_secrets(db: Session, provider: str, incoming: dict) -> dict:
    """İstemciden maskeli gelen sır alanlarını DB'deki gerçek değerle değiştirir."""
    incoming = dict(incoming or {})
    stored = None
    for key in SECRET_KEYS:
        if is_masked(incoming.get(key)):
            if stored is None:
                stored = _stored_config(db, provider)
            incoming[key] = stored.get(key, "")
    return incoming


def _default_integration(provider: str) -> dict:
    """Kayıt yoksa frontend'in bekleyebileceği varsayılan yapı."""
    return {"id": None, "provider": provider, "is_active": False, "config": {}}


def get_integration(db: Session, provider: str) -> dict:
    row = db.query(models.Integration).filter(
        models.Integration.provider == provider
    ).first()
    
    if not row:
        return _default_integration(provider)
    
    # 🔥 KRİTİK DÜZELTME BAŞLANGICI 🔥
    config_data = row.config or {}
    
    # Eğer veritabanında eski düzenden kalma 'string' formatında bir JSON varsa:
    if isinstance(config_data, str):
        try:
            config_data = json.loads(config_data)
        except json.JSONDecodeError:
            # Parse edilemezse boş obje dön
            config_data = {}
    # 🔥 KRİTİK DÜZELTME BİTİŞİ 🔥

    return {
        "id":        row.id,
        "provider":  row.provider,
        "is_active": row.is_active,
        "config":    _mask_config(config_data),
    }


def get_all_integrations(db: Session) -> list[dict]:
    return [get_integration(db, p) for p in _PROVIDERS]


def upsert_integration(
    db: Session,
    provider: str,
    data: schemas.IntegrationUpsert,
) -> dict:
    if provider not in _PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Geçersiz provider: {provider}")

    config = resolve_secrets(db, provider, data.config)

    row = db.query(models.Integration).filter(
        models.Integration.provider == provider
    ).first()

    if row:
        row.is_active = data.is_active
        row.config    = config
    else:
        row = models.Integration(
            provider=provider,
            is_active=data.is_active,
            config=config,
        )
        db.add(row)

    db.commit()
    db.refresh(row)
    logger.info(f"Integration upserted: provider={provider} active={data.is_active}")
    
    return {
        "id":        row.id,
        "provider":  row.provider,
        "is_active": row.is_active,
        "config":    _mask_config(row.config or {}),
    }