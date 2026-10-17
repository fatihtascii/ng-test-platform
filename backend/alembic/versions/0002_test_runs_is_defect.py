"""test_runs.is_defect — otomatik/manuel defect kayıtlarını normal koşumlardan ayırır

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("test_runs") as batch_op:
        batch_op.add_column(
            sa.Column("is_defect", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.create_index("ix_test_runs_is_defect", ["is_defect"])

    # Eski otomatik defect kayıtlarını işaretle (önceden sadece isimle ayırt ediliyordu)
    op.execute(
        "UPDATE test_runs SET is_defect = TRUE WHERE name LIKE 'Oto-Defect Yakalaması%'"
    )


def downgrade() -> None:
    with op.batch_alter_table("test_runs") as batch_op:
        batch_op.drop_index("ix_test_runs_is_defect")
        batch_op.drop_column("is_defect")
