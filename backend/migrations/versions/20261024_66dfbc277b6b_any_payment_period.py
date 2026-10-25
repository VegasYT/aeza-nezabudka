"""any payment period

Revision ID: 66dfbc277b6b
Revises: 0a6ac242e7a3
Create Date: 2026-10-24 21:03:55.467225+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '66dfbc277b6b'
down_revision: Union[str, Sequence[str], None] = '0a6ac242e7a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recurring_payments', sa.Column('period_count', sa.SmallInteger(), server_default='1', nullable=False))
    op.drop_constraint(op.f('ck_recurring_payments_period_known'), 'recurring_payments', type_='check')
    op.create_check_constraint(op.f('ck_recurring_payments_period_known'), 'recurring_payments', "period in ('day', 'week', 'month', 'year')")
    op.create_check_constraint(op.f('ck_recurring_payments_period_count_range'), 'recurring_payments', 'period_count between 1 and 366')


def downgrade() -> None:
    op.drop_constraint(op.f('ck_recurring_payments_period_count_range'), 'recurring_payments', type_='check')
    op.drop_constraint(op.f('ck_recurring_payments_period_known'), 'recurring_payments', type_='check')
    # платежи с другими периодами прежняя схема хранить не умеет
    op.execute("update recurring_payments set period = 'month' where period <> 'month'")
    op.create_check_constraint(op.f('ck_recurring_payments_period_known'), 'recurring_payments', "period = 'month'")
    op.drop_column('recurring_payments', 'period_count')
