from sqlalchemy import Column, Integer, String, Text, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.base import Base
from app.core.types import UTCDateTime as DateTime  # UTC + saat dilimli


class Defect(Base):
    """
    Hata kaydı. Kaynağı ikiye ayrılır:
      - auto:   bir test koşumunda başarısız olan case'lerden otomatik üretilir
                (koşum başına tek kayıt, test_run_id dolu)
      - manual: kullanıcının elle açtığı kayıt
    """
    __tablename__ = "defects"

    id             = Column(Integer, primary_key=True, index=True)
    title          = Column(String(500), nullable=False)
    description    = Column(Text, nullable=True)
    severity       = Column(String(20), nullable=False, default="Orta")
    status         = Column(String(30), nullable=False, default="Open", index=True)
    source         = Column(String(20), nullable=False, default="manual")
    project_id     = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    test_run_id    = Column(Integer, ForeignKey("test_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    test_case_id   = Column(Integer, ForeignKey("test_cases.id", ondelete="SET NULL"), nullable=True)
    # [{"case_id": 3, "title": "...", "error": "...", "severity": "Yüksek"}]
    failed_details = Column(Text, nullable=False, default="[]", server_default="[]")
    created_by     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at     = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at     = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project  = relationship("Project")
    test_run = relationship("TestRun")
    author   = relationship("User")

    __table_args__ = (
        Index("ix_defects_project_status", "project_id", "status"),
    )

    def __repr__(self):
        return f"<Defect id={self.id} status={self.status!r} source={self.source!r}>"
