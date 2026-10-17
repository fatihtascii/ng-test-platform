"""zaman damgaları saat dilimli (timestamptz) ve UTC

Eskiden kolonlar saat dilimsizdi ve bağlantıdaki "SET TIME ZONE 'UTC'" rollback ile
kaybolduğu için kayıtların çoğu sunucunun yerel saatiyle yazılmıştı. Mevcut değerler
sunucunun varsayılan saat dilimine göre yorumlanıp timestamptz'e çevrilir.

SQLite'ta saat dilimi tipi yoktur; değerler UTC kabul edilir (uygulama katmanı halleder).

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

COLUMNS = {
    "integrations": ["created_at", "updated_at"],
    "projects":     ["created_at", "updated_at"],
    "roles":        ["created_at"],
    "users":        ["created_at", "updated_at"],
    "environments": ["created_at"],
    "test_cases":   ["created_at", "updated_at"],
    "test_plans":   ["created_at", "updated_at"],
    "test_runs":    ["created_at", "updated_at"],
    "defects":      ["created_at", "updated_at"],
}


def _server_timezone(conn) -> str:
    """
    Eski kayıtlar sunucunun varsayılan saat dilimiyle yazıldı. Uygulamanın bağlantısı artık
    "timezone=UTC" seçeneğiyle açıldığı için bu değeri ek ayar olmadan açılan ayrı bir
    bağlantıdan okuyoruz (postgresql.conf / veritabanı / rol ayarı neyse o).
    """
    plain = sa.create_engine(conn.engine.url, poolclass=sa.pool.NullPool)
    try:
        with plain.connect() as c:
            return c.exec_driver_sql("SHOW timezone").scalar() or "UTC"
    finally:
        plain.dispose()


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    tz = _server_timezone(conn).replace("'", "")
    for table, cols in COLUMNS.items():
        for col in cols:
            op.execute(
                f'ALTER TABLE {table} ALTER COLUMN {col} TYPE TIMESTAMP WITH TIME ZONE '
                f"USING {col} AT TIME ZONE '{tz}'"
            )


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    for table, cols in COLUMNS.items():
        for col in cols:
            op.execute(
                f"ALTER TABLE {table} ALTER COLUMN {col} TYPE TIMESTAMP WITHOUT TIME ZONE "
                f"USING {col} AT TIME ZONE 'UTC'"
            )
