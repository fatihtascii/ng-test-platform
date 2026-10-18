from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey, Index, CheckConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.base import Base
from app.core.types import UTCDateTime as DateTime  # UTC + saat dilimli


class TestCase(Base):
    __tablename__ = "test_cases"

    id    = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), index=True, nullable=False)

    # 🚀 POSTGRESQL AVANTAJI: Text tipi 1GB'a kadar veri alır.
    # Base64 görselleri içeren devasa JSON verisi buraya sorunsuzca sığacaktır.
    description = Column(Text, nullable=True)

    status   = Column(String(30), default="Test Edilmedi", nullable=False)
    priority = Column(String(20), default="Orta",          nullable=False)

    # BDD Gherkin senaryosu
    gherkin_scenario = Column(Text, nullable=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    tags = Column(Text, default="[]", server_default="[]", nullable=False)

    execution_type = Column(
        String(50),
        default="Manual",
        server_default="Manual",
        nullable=False,
    )

    # Otomasyon sayfasından tetiklenecek saf Python/Playwright kodu
    automation_script = Column(Text, nullable=True)

    # Bağlı otomasyon deposundaki test (suites modülü): parametresiz pytest node id'si
    suite_id       = Column(Integer, ForeignKey("automation_suites.id", ondelete="SET NULL"), nullable=True)
    automation_ref = Column(String(500), nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    # ── İlişkiler ────────────────────────────────────────────────
    project    = relationship("Project",      back_populates="test_cases")
    plan_items = relationship(
        "TestPlanItem",
        back_populates="test_case",
        cascade="all, delete-orphan",
    )

    # ── Index & Constraint'ler ───────────────────────────────────
    __table_args__ = (
        Index("ix_test_cases_project_status", "project_id", "status"),
        Index("ix_test_cases_project_execution", "project_id", "execution_type"),

        CheckConstraint(
            "status IN ('Taslak', 'Test Edilmedi', 'Başarılı', 'Başarısız')",
            name="ck_test_cases_status",
        ),
        CheckConstraint(
            "priority IN ('Düşük', 'Orta', 'Yüksek', 'Kritik')",
            name="ck_test_cases_priority",
        ),
        CheckConstraint(
            "execution_type IN ('Manual', 'Automated')",
            name="ck_test_cases_execution_type",
        ),
    )

    def __repr__(self) -> str:
        safe_title = (self.title or "")[:40]
        return f"<TestCase id={self.id} title={safe_title!r}>"