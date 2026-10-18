"""defects.assignee_id / resolved_at ve defect_activity — atama, yorumlar ve değişiklik geçmişi

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("defects") as batch_op:
        batch_op.add_column(sa.Column("assignee_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key("fk_defects_assignee_id_users", "users", ["assignee_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index("ix_defects_assignee_id", ["assignee_id"], unique=False)

    op.create_table(
        "defect_activity",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("defect_id", sa.Integer(), sa.ForeignKey("defects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("from_value", sa.String(length=200), nullable=True),
        sa.Column("to_value", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_defect_activity_defect_id", "defect_activity", ["defect_id"], unique=False)

    # Zaten çözülmüş kayıtlar için çözülme zamanı olarak son güncellemeyi kullan
    op.execute("update defects set resolved_at = updated_at where status = 'Resolved'")


def downgrade() -> None:
    op.drop_index("ix_defect_activity_defect_id", table_name="defect_activity")
    op.drop_table("defect_activity")
    with op.batch_alter_table("defects") as batch_op:
        batch_op.drop_index("ix_defects_assignee_id")
        batch_op.drop_constraint("fk_defects_assignee_id_users", type_="foreignkey")
        batch_op.drop_column("resolved_at")
        batch_op.drop_column("assignee_id")
