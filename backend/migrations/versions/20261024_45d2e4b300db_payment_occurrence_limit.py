"""payment occurrence limit

Revision ID: 45d2e4b300db
Revises: 5a7e1834fe50
Create Date: 2026-10-24 22:48:06.717398+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '45d2e4b300db'
down_revision: Union[str, Sequence[str], None] = '5a7e1834fe50'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recurring_payments', sa.Column('occurrence_limit', sa.SmallInteger(), nullable=True))
    op.create_check_constraint(op.f('ck_recurring_payments_occurrence_limit_range'), 'recurring_payments', 'occurrence_limit between 1 and 1000')


def downgrade() -> None:
    op.drop_constraint(op.f('ck_recurring_payments_occurrence_limit_range'), 'recurring_payments', type_='check')
    op.drop_column('recurring_payments', 'occurrence_limit')
