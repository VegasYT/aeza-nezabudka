"""payment receipts

Revision ID: 5351d17a1378
Revises: 152904bb45bb
Create Date: 2026-10-25 05:59:05.913506+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5351d17a1378'
down_revision: Union[str, Sequence[str], None] = '152904bb45bb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('occurrence_receipts',
    sa.Column('occurrence_id', sa.Uuid(), nullable=False),
    sa.Column('object_key', sa.String(length=200), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('content_type', sa.String(length=64), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=False),
    sa.Column('uploaded_by_id', sa.Uuid(), nullable=False),
    sa.Column('uploaded_by_login', sa.String(length=255), nullable=False),
    sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('size > 0', name=op.f('ck_occurrence_receipts_size_positive')),
    sa.ForeignKeyConstraint(['occurrence_id'], ['payment_occurrences.id'], name=op.f('fk_occurrence_receipts_occurrence_id_payment_occurrences'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('occurrence_id', name=op.f('pk_occurrence_receipts')),
    sa.UniqueConstraint('object_key', name=op.f('uq_occurrence_receipts_object_key'))
    )


def downgrade() -> None:
    op.drop_table('occurrence_receipts')
