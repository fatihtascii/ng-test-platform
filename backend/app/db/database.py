import os
import logging
from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base

logger = logging.getLogger("ng-test.db")

# ─────────────────────────────────────────
# VERİTABANI BAĞLANTI URL'İ
# ─────────────────────────────────────────
# ⚠️  ASLA şifre veya bağlantı bilgisini koda yazmayın.
# .env dosyası oluşturun ve aşağıdaki satırı ekleyin:
#   DATABASE_URL=postgresql://kullanici:sifre@localhost/veritabani
#
# Geliştirme ortamında .env yoksa SQLite'a düşer.
# Production'da DATABASE_URL environment variable ZORUNLUDUR.

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    _env = os.getenv("APP_ENV", "development")
    if _env == "production":
        raise RuntimeError(
            "Production ortamında DATABASE_URL environment variable zorunludur.\n"
            "Örnek: export DATABASE_URL=postgresql://user:pass@host/dbname"
        )
    # Geliştirme fallback — SQLite
    DATABASE_URL = "sqlite:///./test.db"
    logger.warning(
        "DATABASE_URL bulunamadı. Geliştirme modu: SQLite (test.db) kullanılıyor. "
        "Production için .env dosyasına DATABASE_URL ekleyin."
    )

# ─────────────────────────────────────────
# ENGINE AYARLARI
# ─────────────────────────────────────────
_is_sqlite     = DATABASE_URL.startswith("sqlite")
_is_postgresql = DATABASE_URL.startswith("postgresql")

# SQLite ve PostgreSQL için farklı engine argümanları gerekir
if _is_sqlite:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # SQLite için zorunlu
        echo=os.getenv("DB_ECHO", "false").lower() == "true",
    )
else:
    engine = create_engine(
        DATABASE_URL,

        # ── Connection Pool ──────────────────────────────────
        poolclass=QueuePool,

        # Havuzda sürekli açık tutulan bağlantı sayısı
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),

        # Havuz doluysa eklenebilecek max ekstra bağlantı
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),

        # Boş bağlantı için max bekleme süresi (saniye)
        pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "30")),

        # Bağlantıyı bu süreden uzun havuzda tutma (saniye)
        # PostgreSQL'in idle_in_transaction_session_timeout değerinin altında olmalı
        pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "1800")),

        # Kullanmadan önce bağlantının hâlâ geçerli olduğunu kontrol et
        pool_pre_ping=True,

        # SQL sorgularını loglamak için DB_ECHO=true env değişkeni kullanın
        echo=os.getenv("DB_ECHO", "false").lower() == "true",
    )

# ─────────────────────────────────────────
# SQLite ÖZEL AYARLARI
# ─────────────────────────────────────────
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """
        SQLite güvenlik ve performans pragmaları.
        Her yeni bağlantıda çalışır.
        """
        cursor = dbapi_connection.cursor()
        # Foreign key kısıtlamalarını aktif et (SQLite'da default kapalı!)
        cursor.execute("PRAGMA foreign_keys = ON")
        # WAL modu: eş zamanlı okuma/yazma performansı
        cursor.execute("PRAGMA journal_mode = WAL")
        # Yavaş sorguları logla (10ms üzeri)
        cursor.execute("PRAGMA busy_timeout = 5000")
        cursor.close()

# ─────────────────────────────────────────
# PostgreSQL ÖZEL AYARLARI
# ─────────────────────────────────────────
if _is_postgresql:
    @event.listens_for(engine, "connect")
    def set_pg_options(dbapi_connection, connection_record):
        """
        PostgreSQL bağlantı başına güvenlik ayarları.
        """
        cursor = dbapi_connection.cursor()
        # Boşta kalan transaction'ları 30 saniye sonra kes
        cursor.execute("SET idle_in_transaction_session_timeout = '30s'")
        # Uzun süren sorguları 60 saniye sonra kes (gerekirse artırın)
        cursor.execute("SET statement_timeout = '60s'")
        cursor.close()

# ─────────────────────────────────────────
# SESSION
# ─────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,  # commit sonrası nesnelere erişimde tekrar sorgu atmayı önler
)

# ─────────────────────────────────────────
# BASE
# ─────────────────────────────────────────
Base = declarative_base()


# ─────────────────────────────────────────
# DB BAĞLANTI SAĞLIĞI KONTROLÜ
# ─────────────────────────────────────────
def check_db_connection() -> bool:
    """
    Veritabanı bağlantısını test eder.
    Uygulama başlangıcında veya health-check endpoint'inde kullanın.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(f"Veritabanı bağlantısı başarılı: {_db_url_safe()}")
        return True
    except Exception as e:
        logger.error(f"Veritabanı bağlantısı BAŞARISIZ: {e}")
        return False


def _db_url_safe() -> str:
    """
    Loglama için URL'den şifreyi gizler.
    postgresql://user:SECRET@host/db → postgresql://user:***@host/db
    """
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(DATABASE_URL)
        if parsed.password:
            safe = parsed._replace(
                netloc=f"{parsed.username}:***@{parsed.hostname}"
                       + (f":{parsed.port}" if parsed.port else "")
            )
            return urlunparse(safe)
    except Exception:
        pass
    return DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL


# ─────────────────────────────────────────
# DEPENDENCY (FastAPI için)
# ─────────────────────────────────────────
def get_db():
    """
    FastAPI dependency injection için DB session üretici.
    
    Kullanım:
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()