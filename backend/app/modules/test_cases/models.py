from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class TestCase(Base):
    __tablename__ = "test_cases"

    id               = Column(Integer,     primary_key=True, index=True)
    title            = Column(String(500), index=True, nullable=False)
    description      = Column(Text,        nullable=True)
    status           = Column(String(30),  default="Test Edilmedi", nullable=False)
    priority         = Column(String(20),  default="Orta",          nullable=False)
    gherkin_scenario = Column(Text,        nullable=True)   # BDD Gherkin senaryosu
    project_id       = Column(Integer,     ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    created_at       = Column(DateTime,    server_default=func.now(), nullable=False)
    updated_at       = Column(DateTime,    server_default=func.now(), onupdate=func.now())

    # İlişkiler (String olarak tanımlandığı için diğer dosyalardaki modellerle sorunsuz çalışır)
    project    = relationship("Project",      back_populates="test_cases")
    plan_items = relationship("TestPlanItem", back_populates="test_case", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_test_cases_project_status", "project_id", "status"),
    )

    def __repr__(self):
        return f"<TestCase id={self.id} title={self.title[:40]}>"