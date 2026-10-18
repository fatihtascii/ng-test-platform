"""
Entegrasyon ayarları API'si. Bildirim/aktarım işleri notify.py'de, GitHub tetiklemesi automation/trigger.py'de.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_permission
from . import schemas, service

router = APIRouter(prefix="/integrations", tags=["Integrations"])


@router.get("/", dependencies=[Depends(require_permission("integrations.view"))], response_model=list[schemas.IntegrationResponse])
def get_all(db: Session = Depends(get_db)):
    return service.get_all(db)


@router.get("/status", dependencies=[Depends(get_current_user)])
def status(db: Session = Depends(get_db)):
    """Hangi entegrasyonun kullanılabilir olduğu (ör. hata detayında 'Jira'ya aktar' düğmesi için)."""
    return service.status(db)


@router.get("/{provider}", dependencies=[Depends(require_permission("integrations.view"))], response_model=schemas.IntegrationResponse)
def get_one(provider: str, db: Session = Depends(get_db)):
    return service.get_integration(db, provider)


@router.put("/{provider}", dependencies=[Depends(require_permission("integrations.manage"))], response_model=schemas.IntegrationResponse)
def upsert(provider: str, payload: schemas.IntegrationUpsert, db: Session = Depends(get_db)):
    return service.upsert(db, provider, payload)


@router.post("/{provider}/test", dependencies=[Depends(require_permission("integrations.manage"))])
def test(provider: str, payload: schemas.IntegrationUpsert, db: Session = Depends(get_db)):
    return service.test_connection(db, provider, payload.config)


@router.get("/{provider}/events", dependencies=[Depends(require_permission("integrations.view"))], response_model=list[schemas.EventResponse])
def events(provider: str, db: Session = Depends(get_db), limit: int = Query(20, ge=1, le=100)):
    return service.list_events(db, provider, limit)
