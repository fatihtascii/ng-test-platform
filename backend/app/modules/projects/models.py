from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.base import Base


class Project(Base):
    __tablename__ = "projects"

    id          = Column(Integer,      primary_key=True, index=True)
    name        = Column(String(200),  index=True, nullable=False)
    description = Column(Text,         nullable=True)
    status      = Column(String(30),   default="Aktif", nullable=False)
    created_at  = Column(DateTime,     server_default=func.now(), nullable=False)
    updated_at  = Column(DateTime,     server_default=func.now(), onupdate=func.now())

    test_cases   = relationship("TestCase",    back_populates="project",      cascade="all, delete-orphan", lazy="select")
    test_plans   = relationship("TestPlan",    back_populates="project",      cascade="all, delete-orphan", lazy="select")
    # FIX: test_runs back_populates korundu, test_plan_id FK eklenmesine rağmen
    # project_id üzerinden ilişki devam ediyor
    test_runs    = relationship("TestRun",     back_populates="project",      cascade="all, delete-orphan", lazy="select")
    environments = relationship("Environment", back_populates="project",      cascade="all, delete-orphan", lazy="select")