# backend/app/db/models.py dosyanıza eklenecek kısım
# Mevcut TestRun modelinizin yanına ekleyin.
#
# Alembic kullanıyorsanız:
#   alembic revision --autogenerate -m "add_mobile_test_run"
#   alembic upgrade head

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

# Mevcut Base import'unuzu kullanın, örnek:
# from app.db.base import Base


class MobilePlatform(str, enum.Enum):
    android = "android"
    ios = "ios"


class MobileRunStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    passed = "passed"
    failed = "failed"


class MobileTestRun(Base):
    """
    Mevcut TestRun tablosuyla ilişkili mobil test koşu kaydı.
    Her mobil koşu, opsiyonel olarak bir TestRun'a bağlanabilir.
    """
    __tablename__ = "mobile_test_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_uuid = Column(String(8), unique=True, index=True, nullable=False)

    # Mevcut test_cases tablosuna FK — tablo adını projenize göre ayarlayın
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False)

    # Opsiyonel: mevcut test_runs tablosuna da bağlayabilirsiniz
    # test_run_id = Column(Integer, ForeignKey("test_runs.id"), nullable=True)

    device_id = Column(String(128), nullable=False)
    platform = Column(Enum(MobilePlatform), nullable=False)
    app_path = Column(String(512), nullable=False)
    app_package = Column(String(256), nullable=True)

    status = Column(Enum(MobileRunStatus), default=MobileRunStatus.pending)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    logs = Column(Text, nullable=True)          # JSON string olarak saklanır

    # İlişkiler (mevcut model adlarınıza göre düzeltin)
    test_case = relationship("TestCase", back_populates="mobile_runs")
    # test_run = relationship("TestRun", back_populates="mobile_runs")
