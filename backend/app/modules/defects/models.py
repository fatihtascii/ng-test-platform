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
    assignee_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    resolved_at    = Column(DateTime, nullable=True)
    # Dış sistemdeki karşılığı (Jira'ya aktarıldıysa: QA-12 ve adresi)
    external_key   = Column(String(50), nullable=True)
    external_url   = Column(String(500), nullable=True)
    created_at     = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at     = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project  = relationship("Project")
    test_run = relationship("TestRun")
    author   = relationship("User", foreign_keys=[created_by])
    assignee = relationship("User", foreign_keys=[assignee_id])
    activity = relationship("DefectActivity", back_populates="defect", cascade="all, delete-orphan",
                            passive_deletes=True, order_by="DefectActivity.id")

    __table_args__ = (
        Index("ix_defects_project_status", "project_id", "status"),
    )

    def __repr__(self):
        return f"<Defect id={self.id} status={self.status!r} source={self.source!r}>"


class DefectActivity(Base):
    """
    Defect geçmişi: yorumlar ve alan değişiklikleri tek akışta tutulur.
      kind: comment | created | status | severity | assignee | title | reopened
      comment → body dolu; diğerlerinde from_value / to_value.
    user_id boşsa değişikliği sistem yapmıştır (ör. koşum tekrar başarısız oldu).
    """
    __tablename__ = "defect_activity"

    id         = Column(Integer, primary_key=True)
    defect_id  = Column(Integer, ForeignKey("defects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind       = Column(String(20), nullable=False)
    body       = Column(Text, nullable=True)
    from_value = Column(String(200), nullable=True)
    to_value   = Column(String(200), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, nullable=True)

    defect = relationship("Defect", back_populates="activity")
    user   = relationship("User")
