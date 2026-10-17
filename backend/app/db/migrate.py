"""
Açılışta veritabanı şemasını Alembic ile günceller.

- Boş DB           → tüm migration'lar uygulanır.
- Alembic öncesi DB → (tablolar var, alembic_version yok) baseline (0001) olarak
                      işaretlenir, ardından sonraki migration'lar uygulanır.
- Sonunda modeller ile DB karşılaştırılır; fark varsa uyarı loglanır.
"""
import logging
import os

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.db.database import engine
from app.db.models import Base

logger = logging.getLogger("ng-test.migrate")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASELINE_REVISION = "0001"


def _alembic_config() -> Config:
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    cfg.attributes["skip_logging_config"] = True  # uygulamanın log ayarlarını ezmesin
    return cfg


def run_migrations() -> None:
    cfg = _alembic_config()
    tables = set(inspect(engine).get_table_names())

    if "alembic_version" not in tables and tables & {"users", "projects", "test_cases"}:
        logger.warning(
            "Alembic öncesi veritabanı bulundu — baseline (%s) olarak işaretleniyor.",
            BASELINE_REVISION,
        )
        command.stamp(cfg, BASELINE_REVISION)

    command.upgrade(cfg, "head")
    logger.info("Veritabanı migration'ları güncel.")
    _warn_schema_drift()


def _warn_schema_drift() -> None:
    """Modelde olup DB'de olmayan tablo/kolonları loglar (Alembic öncesi elle değişiklikler için)."""
    with engine.connect() as conn:
        diffs = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    important = [
        d for d in _flatten(diffs)
        if d[0] in ("add_table", "add_column", "remove_column", "remove_table")
    ]
    for d in important:
        if d[0] == "add_column":
            logger.warning("Şema farkı: DB'de eksik kolon %s.%s", d[2], d[3].name)
        elif d[0] == "add_table":
            logger.warning("Şema farkı: DB'de eksik tablo %s", d[1].name)
        elif d[0] == "remove_column":
            logger.warning("Şema farkı: DB'de modelde olmayan kolon %s.%s", d[2], d[3].name)
        elif d[0] == "remove_table":
            logger.warning("Şema farkı: DB'de modelde olmayan tablo %s", d[1].name)
    if important:
        logger.warning(
            "Şema farkları için: `alembic revision --autogenerate -m \"aciklama\"` "
            "ile migration üretip inceleyin."
        )


def _flatten(diffs):
    for d in diffs:
        if isinstance(d, list):
            yield from _flatten(d)
        else:
            yield d
