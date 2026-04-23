import os
import logging
from urllib.parse import urlparse, urlunparse
from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool, NullPool

logger = logging.getLogger("ng-test.db")

# ─────────────────────────────────────────
# VERİTABANI BAĞLANTI URL'İ
# ─────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    _env = os.getenv("APP_ENV", "development")
    if _env == "production":
        raise RuntimeError(
            "Production ortamında DATABASE_URL environment variable zorunludur.\n"
            "Örnek: export DATABASE_URL=postgresql://user:pass@host/dbname"
        )
    DATABASE_URL = "sqlite:///./test.db"
    logger.warning(
        "DATABASE_URL bulunamadı. Geliştirme modu: SQLite (test.db) kullanılıyor. "
        "Production için .env dosyasına DATABASE_URL ekleyin."
    )

# FIX: Heroku/Render gibi platformlar hâlâ "postgres://" prefix'i döndürüyor.
# SQLAlchemy 1.4+ "postgres://" URL'ini reddediyor — "postgresql://" olmalı.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    logger.info("DATABASE_URL 'postgres://' -> 'postgresql://' olarak düzeltildi.")

# ─────────────────────────────────────────
# DRIVER TESPİTİ
# ─────────────────────────────────────────
_is_sqlite     = DATABASE_URL.startswith("sqlite")
_is_postgresql = DATABASE_URL.startswith("postgresql")

# FIX: Desteklenmeyen DB türü için erken uyarı
if not _is_sqlite and not _is_postgresql:
    logger.warning(
        f"Bilinmeyen veritabanı tipi tespit edildi: {DATABASE_URL.split(':')[0]}. "
        "Yalnızca SQLite ve PostgreSQL test edilmiştir."
    )

# ─────────────────────────────────────────
# ENGINE AYARLARI
# ─────────────────────────────────────────
if _is_sqlite:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=os.getenv("DB_ECHO", "false").lower() == "true",
        # FIX: SQLite'da pool_size/max_overflow yoktur — StaticPool veya default yeterli.
        # QueuePool ile kullanılırsa SQLAlchemy uyarı verir.
    )

else:
    # FIX: pool_size, max_overflow, pool_timeout değerleri
    # int() direkt patlayabilir — getenv None dönerse int(None) TypeError atar.
    # Güvenli parse için yardımcı kullanıyoruz.
    def _env_int(key: str, default: int) -> int:
        val = os.getenv(key)
        try:
            return int(val) if val is not None else default
        except ValueError:
            logger.warning(f"Geçersiz {key} değeri '{val}', varsayılan {default} kullanılıyor.")
            return default

    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=_env_int("DB_POOL_SIZE", 5),
        max_overflow=_env_int("DB_MAX_OVERFLOW", 10),
        pool_timeout=_env_int("DB_POOL_TIMEOUT", 30),
        pool_recycle=_env_int("DB_POOL_RECYCLE", 1800),
        pool_pre_ping=True,
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
        cursor.execute("PRAGMA foreign_keys = ON")   # FK kısıtlamaları (default kapalı)
        cursor.execute("PRAGMA journal_mode = WAL")  # Eş zamanlı okuma/yazma
        cursor.execute("PRAGMA busy_timeout = 5000") # Kilit bekleme süresi (ms)
        # FIX: synchronous=NORMAL — WAL modunda veri güvenliği ile performans dengesi
        cursor.execute("PRAGMA synchronous = NORMAL")
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
        # FIX: statement_timeout, SET ile değil SHOW ile okunmalı —
        # ama burada sadece SET ediyoruz, doğrudan string literal güvenli.
        cursor.execute("SET idle_in_transaction_session_timeout = '30s'")
        cursor.execute("SET statement_timeout = '60s'")
        # FIX: timezone ayarı eklendi — timestamp karışıklığını önler
        cursor.execute("SET TIME ZONE 'UTC'")
        cursor.close()

    # FIX: PostgreSQL pool checkout event — bağlantı alındığında canlılık logu
    @event.listens_for(engine, "checkout")
    def pg_pool_checkout(dbapi_connection, connection_record, connection_proxy):
        logger.debug("DB pool'dan bağlantı alındı.")

# ─────────────────────────────────────────
# SESSION
# ─────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    # FIX: expire_on_commit=False — commit sonrası nesneye erişimde
    # ekstra SELECT atmayı önler. WebSocket handler gibi uzun yaşayan
    # bağlamlarda önemli. Ancak stale data riskine karşı bilinçli kullanılmalı.
    expire_on_commit=False,
)

# ─────────────────────────────────────────
# DB BAĞLANTI SAĞLIĞI KONTROLÜ
# ─────────────────────────────────────────
def check_db_connection() -> bool:
    """
    Veritabanı bağlantısını test eder.
    main.py lifespan veya /health endpoint'inde kullanın.

    Örnek (main.py):
        if not check_db_connection():
            logger.critical("DB bağlantısı kurulamadı, uygulama başlatılmıyor.")
            sys.exit(1)
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
        parsed = urlparse(DATABASE_URL)
        if parsed.password:
            # FIX: IPv6 host veya hostname=None durumunda patlamaması için
            host_part = parsed.hostname or ""
            port_part = f":{parsed.port}" if parsed.port else ""
            safe = parsed._replace(
                netloc=f"{parsed.username}:***@{host_part}{port_part}"
            )
            return urlunparse(safe)
    except Exception:
        pass
    # Fallback: @ sonrasını göster (şifre içermiyor)
    return DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL


# ─────────────────────────────────────────
# DEPENDENCY (FastAPI)
# ─────────────────────────────────────────
def get_db():
    """
    FastAPI dependency injection için DB session üretici.

    Kullanım:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db)):
            ...

    FIX: Exception durumunda rollback yapıp tekrar raise ediyor.
    Bu sayede yarım kalan transaction'lar commit edilmeden session kapanıyor.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ─────────────────────────────────────────
# BASE IMPORT (geriye dönük uyumluluk)
# ─────────────────────────────────────────
# FIX: Bu import'u kaldırmayın — projedeki diğer modüller
# `from app.db.database import Base` ile alıyor olabilir.
# Ancak Base'in asıl tanımı app/core/base.py içinde olmalı.
from app.core.base import Base