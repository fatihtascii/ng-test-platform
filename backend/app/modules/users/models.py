from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.base import Base

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String(50),  unique=True, index=True, nullable=False)
    email           = Column(String(255), unique=True, index=True, nullable=True)
    full_name       = Column(String(200), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(String(30),  default="viewer", nullable=False)
    created_at      = Column(DateTime,    server_default=func.now(), nullable=False)
    updated_at      = Column(DateTime,    server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<User id={self.id} username={self.username} role={self.role}>"