from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.base import Base


class TestPlan(Base):
    __tablename__ = "test_plans"

    id          = Column(Integer,     primary_key=True, index=True)
    title       = Column(String(500), index=True, nullable=False)
    description = Column(Text,        nullable=True)
    status      = Column(String(30),  default="Aktif", nullable=False)
    project_id  = Column(Integer,     ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    start_date  = Column(String(10),  nullable=True)
    end_date    = Column(String(10),  nullable=True)
    created_at  = Column(DateTime,    server_default=func.now(), nullable=False)
    updated_at  = Column(DateTime,    server_default=func.now(), onupdate=func.now())

    project   = relationship("Project",      back_populates="test_plans")
    items     = relationship("TestPlanItem", back_populates="plan", cascade="all, delete-orphan")

    # FIX: TestRun.test_plan_id FK'sinin back_populates'u
    test_runs = relationship(
        "TestRun",
        back_populates="test_plan",
        foreign_keys="TestRun.test_plan_id",
        lazy="select",
    )

    def __repr__(self):
        return f"<TestPlan id={self.id} title={self.title[:40]!r}>"


class TestPlanItem(Base):
    __tablename__ = "test_plan_items"

    id           = Column(Integer,    primary_key=True, index=True)
    plan_id      = Column(Integer,    ForeignKey("test_plans.id",  ondelete="CASCADE"), nullable=False)
    test_case_id = Column(Integer,    ForeignKey("test_cases.id",  ondelete="CASCADE"), nullable=False)
    run_status   = Column(String(30), default="Bekliyor", nullable=False)
    note         = Column(Text,       nullable=True)

    plan      = relationship("TestPlan", back_populates="items")
    test_case = relationship("TestCase", back_populates="plan_items")

    __table_args__ = (
        UniqueConstraint("plan_id", "test_case_id", name="uq_plan_testcase"),
    )

    def __repr__(self):
        return f"<TestPlanItem plan={self.plan_id} case={self.test_case_id} status={self.run_status!r}>"