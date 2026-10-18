from sqlalchemy import Column, Integer, String, Boolean, true
from sqlalchemy.sql import func
from app.core.base import Base
from app.core.types import UTCDateTime as DateTime  # UTC + saat dilimli

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String(50),  unique=True, index=True, nullable=False)
    email           = Column(String(255), unique=True, index=True, nullable=True)
    full_name       = Column(String(200), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(String(30),  default="viewer", nullable=False)
    # Devre dışı hesap giriş yapamaz, mevcut oturumları da geçersiz olur (geçmiş kayıtlar korunur)
    is_active       = Column(Boolean,     default=True, server_default=true(), nullable=False)
    last_login_at   = Column(DateTime,    nullable=True)
    created_at      = Column(DateTime,    server_default=func.now(), nullable=False)
    updated_at      = Column(DateTime,    server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<User id={self.id} username={self.username} role={self.role}>"