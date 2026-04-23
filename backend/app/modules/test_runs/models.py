from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.base import Base

class TestRun(Base):
    __tablename__ = "test_runs"

    id          = Column(Integer,     primary_key=True, index=True)
    name        = Column(String(500), nullable=False)
    description = Column(Text,        nullable=True)
    status      = Column(String(30),  default="Aktif", nullable=False)
    project_id  = Column(Integer,     ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    results     = Column(Text,        nullable=True, default="[]")
    created_at  = Column(DateTime,    server_default=func.now(), nullable=False)
    updated_at  = Column(DateTime,    server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="test_runs")

    def __repr__(self):
        return f"<TestRun id={self.id} name={self.name[:40]}>"