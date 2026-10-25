"""reminder window

Revision ID: 152904bb45bb
Revises: 45d2e4b300db
Create Date: 2026-10-25 05:28:09.355301+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '152904bb45bb'
down_revision: Union[str, Sequence[str], None] = '45d2e4b300db'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('reminder_defaults',
    sa.Column('id', sa.SmallInteger(), nullable=False),
    sa.Column('days_before', sa.SmallInteger(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('days_before between 0 and 30', name=op.f('ck_reminder_defaults_days_before_range')),
    sa.CheckConstraint('id = 1', name=op.f('ck_reminder_defaults_single_row')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_reminder_defaults'))
    )
    op.add_column('recurring_payments', sa.Column('reminder_days_before', sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        op.f('ck_recurring_payments_reminder_days_range'),
        'recurring_payments',
        'reminder_days_before between 0 and 30',
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f('ck_recurring_payments_reminder_days_range'), 'recurring_payments', type_='check'
    )
    op.drop_column('recurring_payments', 'reminder_days_before')
    op.drop_table('reminder_defaults')
