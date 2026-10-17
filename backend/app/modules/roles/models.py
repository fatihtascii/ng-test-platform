from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.base import Base
from app.core.types import UTCDateTime as DateTime  # UTC + saat dilimli

class Role(Base):
    __tablename__ = "roles"

    id           = Column(Integer,     primary_key=True, index=True)
    name         = Column(String(30),  unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    description  = Column(Text,        nullable=True)
    color        = Column(String(20),  default="indigo", nullable=False)
    is_system    = Column(Boolean,     default=False,    nullable=False)
    created_at   = Column(DateTime,    server_default=func.now(), nullable=False)

    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Role id={self.id} name={self.name}>"

class Permission(Base):
    __tablename__ = "permissions"

    id          = Column(Integer,     primary_key=True, index=True)
    key         = Column(String(100), unique=True, nullable=False)
    name        = Column(String(200), nullable=False)
    description = Column(Text,        nullable=True)
    module      = Column(String(50),  nullable=False, index=True)

    roles = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Permission key={self.key}>"

class RolePermission(Base):
    __tablename__ = "role_permissions"

    id            = Column(Integer, primary_key=True, index=True)
    role_id       = Column(Integer, ForeignKey("roles.id",       ondelete="CASCADE"), nullable=False)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)

    role       = relationship("Role",       back_populates="permissions")
    permission = relationship("Permission", back_populates="roles")

    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )

    def __repr__(self):
        return f"<RolePermission role={self.role_id} perm={self.permission_id}>"