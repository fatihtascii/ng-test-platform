# backend/app/modules/integrations/models.py
from sqlalchemy import Column, Integer, String, Boolean, JSON
from sqlalchemy.sql import func
from app.core.base import Base
from app.core.types import UTCDateTime as DateTime  # UTC + saat dilimli


class Integration(Base):
    __tablename__ = "integrations"

    id         = Column(Integer,  primary_key=True, index=True)
    provider   = Column(String(30), unique=True, nullable=False, index=True)
    is_active  = Column(Boolean,  default=False, nullable=False)
    config     = Column(JSON,     nullable=True, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Integration provider={self.provider} active={self.is_active}>"