"""integration_events tablosu ve defects.external_key / external_url

Entegrasyonların her gönderimi (Slack bildirimi, Jira kaydı, GitHub tetiklemesi) kayıt altına alınır.
Jira'ya aktarılan hata kaydının anahtarı (QA-12) ve adresi defect üzerinde tutulur.

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "integration_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("event", sa.String(length=50), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("ref", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_integration_events_provider", "integration_events", ["provider", "id"], unique=False)
    with op.batch_alter_table("defects") as batch_op:
        batch_op.add_column(sa.Column("external_key", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("external_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("defects") as batch_op:
        batch_op.drop_column("external_url")
        batch_op.drop_column("external_key")
    op.drop_index("ix_integration_events_provider", table_name="integration_events")
    op.drop_table("integration_events")
