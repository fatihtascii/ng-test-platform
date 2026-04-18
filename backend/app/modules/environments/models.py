from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class Environment(Base):
    __tablename__ = "environments"

    id          = Column(Integer,     primary_key=True, index=True)
    name        = Column(String(200), nullable=False)
    project_id  = Column(Integer,     ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    url         = Column(String(500), nullable=False)
    description = Column(Text,        nullable=True)
    created_at  = Column(DateTime,    server_default=func.now(), nullable=False)

    project   = relationship("Project",  back_populates="environments")
    variables = relationship("Variable", back_populates="environment", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Environment id={self.id} name={self.name}>"

class Variable(Base):
    __tablename__ = "variables"

    id         = Column(Integer,     primary_key=True, index=True)
    key        = Column(String(200), nullable=False)
    value      = Column(Text,        nullable=False)
    project_id = Column(Integer,     ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    env_id     = Column(Integer,     ForeignKey("environments.id", ondelete="CASCADE"), nullable=True)
    is_secret  = Column(Boolean,     default=False, nullable=False)

    environment = relationship("Environment", back_populates="variables")

    # Aynı ortamda aynı anahtar (key) iki kez olamaz kuralı
    __table_args__ = (
        UniqueConstraint("env_id", "key", name="uq_env_variable_key"),
    )

    def __repr__(self):
        return f"<Variable key={self.key} env={self.env_id}>"