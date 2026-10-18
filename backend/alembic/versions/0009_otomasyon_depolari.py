"""automation_suites tablosu; test_cases.suite_id / automation_ref

Dış bir pytest projesinin (GitHub deposu) NG Test'e bağlanması. Depodaki her test fonksiyonu
bir test case'e bağlanır: automation_ref = parametresiz pytest node id'si.

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "automation_suites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repo_url", sa.String(length=500), nullable=False),
        sa.Column("branch", sa.String(length=200), nullable=False, server_default="main"),
        sa.Column("token", sa.Text(), nullable=True),
        sa.Column("test_path", sa.String(length=300), nullable=False, server_default="tests"),
        sa.Column("environment_id", sa.Integer(), sa.ForeignKey("environments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("profiles", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("workers", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("timeout_minutes", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("sync_status", sa.String(length=20), nullable=False, server_default="never"),
        sa.Column("sync_log", sa.Text(), nullable=True),
        sa.Column("sync_summary", sa.Text(), nullable=True),
        sa.Column("commit_sha", sa.String(length=64), nullable=True),
        sa.Column("commit_message", sa.String(length=500), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("ix_automation_suites_project_id", "automation_suites", ["project_id"], unique=False)
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.add_column(sa.Column("suite_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("automation_ref", sa.String(length=500), nullable=True))
        batch_op.create_foreign_key("fk_test_cases_suite_id", "automation_suites", ["suite_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index("ix_test_cases_suite_ref", ["suite_id", "automation_ref"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("test_cases") as batch_op:
        batch_op.drop_index("ix_test_cases_suite_ref")
        batch_op.drop_constraint("fk_test_cases_suite_id", type_="foreignkey")
        batch_op.drop_column("automation_ref")
        batch_op.drop_column("suite_id")
    op.drop_index("ix_automation_suites_project_id", table_name="automation_suites")
    op.drop_table("automation_suites")
