from sqlalchemy import (
    Column, Integer, String, Text, DateTime,
    ForeignKey, Index, CheckConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.base import Base


class TestCase(Base):
    __tablename__ = "test_cases"

    id    = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), index=True, nullable=False)

    # JSON string olarak adımları ve meta bilgileri tutar
    description = Column(Text, nullable=True)

    status   = Column(String(30), default="Test Edilmedi", nullable=False)
    priority = Column(String(20), default="Orta",          nullable=False)

    # BDD Gherkin senaryosu
    gherkin_scenario = Column(Text, nullable=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # FIX: Yalnız project_id sorguları için tek kolon index
    )

    # FIX: server_default eklendi — ORM bypass edilerek yapılan INSERT'lerde
    # de "[]" varsayılanı garantilenir.
    tags = Column(Text, default="[]", server_default="[]", nullable=False)

    # FIX: execution_type için server_default eklendi.
    # CheckConstraint DB seviyesinde geçersiz değerleri engeller.
    execution_type = Column(
        String(50),
        default="Manual",
        server_default="Manual",
        nullable=False,
    )

    # Otomasyon sayfasından tetiklenecek saf Python/Playwright kodu
    automation_script = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # FIX: onupdate=func.now() yalnızca ORM üzerinden yapılan UPDATE'lerde çalışır.
    # Direkt SQL UPDATE'lerinde güncellenmez — bu SQLAlchemy'nin bilinen sınırlamasıdır.
    # PostgreSQL kullanıyorsanız trigger ile de destekleyebilirsiniz (opsiyonel).
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
        # Mevcut: proje bazlı durum sorgularını hızlandırır
        Index("ix_test_cases_project_status", "project_id", "status"),

        # FIX: Otomasyon sayfası execution_type'a göre filtreler — index gerekli
        Index("ix_test_cases_project_execution", "project_id", "execution_type"),

        # FIX: DB seviyesinde geçersiz status değerlerini engeller
        CheckConstraint(
            "status IN ('Taslak', 'Test Edilmedi', 'Başarılı', 'Başarısız')",
            name="ck_test_cases_status",
        ),

        # FIX: DB seviyesinde geçersiz priority değerlerini engeller
        CheckConstraint(
            "priority IN ('Düşük', 'Orta', 'Yüksek', 'Kritik')",
            name="ck_test_cases_priority",
        ),

        # FIX: DB seviyesinde geçersiz execution_type değerlerini engeller
        CheckConstraint(
            "execution_type IN ('Manual', 'Automated')",
            name="ck_test_cases_execution_type",
        ),
    )

    # FIX: title None ise __repr__ patlamaz
    def __repr__(self) -> str:
        safe_title = (self.title or "")[:40]
        return f"<TestCase id={self.id} title={safe_title!r}>"