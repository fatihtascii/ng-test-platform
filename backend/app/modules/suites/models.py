from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.base import Base
from app.core.types import UTCDateTime as DateTime


class AutomationSuite(Base):
    """
    Dış bir pytest otomasyon projesi (GitHub deposu). NG Test depoyu kendi klasörüne çeker,
    ayrı bir sanal ortam kurar, testleri keşfedip case olarak içe aktarır ve koşturur.
    sync_status: never | syncing | ready | error
    profiles: JSON [{"name": "Smoke", "marker": "smoke"}, …] — pytest -m ifadesi
    """
    __tablename__ = "automation_suites"

    id              = Column(Integer, primary_key=True)
    name            = Column(String(200), nullable=False)
    project_id      = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    repo_url        = Column(String(500), nullable=False)
    branch          = Column(String(200), nullable=False, default="main", server_default="main")
    token           = Column(Text, nullable=True)
    test_path       = Column(String(300), nullable=False, default="tests", server_default="tests")
    environment_id  = Column(Integer, ForeignKey("environments.id", ondelete="SET NULL"), nullable=True)
    profiles        = Column(Text, nullable=False, default="[]", server_default="[]")
    workers         = Column(Integer, nullable=False, default=1, server_default="1")
    timeout_minutes = Column(Integer, nullable=False, default=120, server_default="120")
    sync_status     = Column(String(20), nullable=False, default="never", server_default="never")
    sync_log        = Column(Text, nullable=True)
    sync_summary    = Column(Text, nullable=True)
    commit_sha      = Column(String(64), nullable=True)
    commit_message  = Column(String(500), nullable=True)
    synced_at       = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project     = relationship("Project")
    environment = relationship("Environment")

    __table_args__ = (Index("ix_automation_suites_project_id", "project_id"),)
