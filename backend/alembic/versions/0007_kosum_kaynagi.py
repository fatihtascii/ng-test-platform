"""test_runs.source / created_by / meta — otomasyon koşumlarını ayırt etme ve koşum bilgisi

source: 'manual' | 'automation'. meta: JSON (tarayıcı, ortam, süre, atlanan case'ler).
Eski otomasyon koşumları adlarından tanınıp işaretlenir.

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("test_runs") as batch_op:
        batch_op.add_column(sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"))
        batch_op.add_column(sa.Column("created_by", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("meta", sa.Text(), nullable=True))
        batch_op.create_foreign_key("fk_test_runs_created_by_users", "users", ["created_by"], ["id"], ondelete="SET NULL")
        batch_op.create_index("ix_test_runs_source", ["source"], unique=False)
    op.execute("update test_runs set source = 'automation' where lower(name) like 'otomasyon%'")


def downgrade() -> None:
    with op.batch_alter_table("test_runs") as batch_op:
        batch_op.drop_index("ix_test_runs_source")
        batch_op.drop_constraint("fk_test_runs_created_by_users", type_="foreignkey")
        batch_op.drop_column("meta")
        batch_op.drop_column("created_by")
        batch_op.drop_column("source")
