from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, false
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.base import Base
from app.core.types import UTCDateTime as DateTime  # UTC + saat dilimli


class TestRun(Base):
    __tablename__ = "test_runs"

    id          = Column(Integer,     primary_key=True, index=True)
    name        = Column(String(500), nullable=False)
    description = Column(Text,        nullable=True)
    status      = Column(String(30),  default="Aktif", nullable=False)
    project_id  = Column(Integer,     ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    # FIX: test_plan_id eklendi — frontend plan seçimiyle koşum oluşturuyorsa bu alan dolu gelir.
    # nullable=True: plan olmadan da koşum oluşturulabilir.
    test_plan_id = Column(
        Integer,
        ForeignKey("test_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # FIX: results Text olarak tutuluyor (JSON string array).
    # Her eleman: { test_case_id, status, actual_result }
    results    = Column(Text,     nullable=True, default="[]")
    # Defect kayıtları (otomasyon hatası veya manuel) normal koşumlardan bu alanla ayrılır
    is_defect  = Column(Boolean,  nullable=False, default=False, server_default=false(), index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project   = relationship("Project",  back_populates="test_runs")
    test_plan = relationship("TestPlan", back_populates="test_runs", foreign_keys=[test_plan_id])

    def __repr__(self):
        return f"<TestRun id={self.id} name={self.name[:40]!r}>"