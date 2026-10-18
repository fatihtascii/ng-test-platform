# backend/app/modules/integrations/models.py
from sqlalchemy import Column, Integer, String, Boolean, JSON, Text, Index
from sqlalchemy.sql import func
from app.core.base import Base
from app.core.types import UTCDateTime as DateTime  # UTC + saat dilimli


class Integration(Base):
    __tablename__ = "integrations"

    id         = Column(Integer,  primary_key=True, index=True)
    provider   = Column(String(30), unique=True, nullable=False, index=True)
    is_active  = Column(Boolean,  default=False, nullable=False)
    config     = Column(JSON,     nullable=True, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Integration provider={self.provider} active={self.is_active}>"


class IntegrationEvent(Base):
    """Bir entegrasyon gönderiminin sonucu (Slack mesajı, Jira kaydı, GitHub tetiklemesi…)."""
    __tablename__ = "integration_events"

    id         = Column(Integer, primary_key=True)
    provider   = Column(String(30), nullable=False)
    event      = Column(String(50), nullable=False)      # ör. run_finished, defect_created, issue_created, push
    ok         = Column(Boolean, nullable=False)
    message    = Column(Text, nullable=True)
    ref        = Column(String(200), nullable=True)      # KS-12, BUG-4, QA-7, commit sha…
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_integration_events_provider", "provider", "id"),)
