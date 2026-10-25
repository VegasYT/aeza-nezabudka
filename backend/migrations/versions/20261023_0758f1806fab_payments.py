"""payments

Revision ID: 0758f1806fab
Revises: 35b9b75afe87
Create Date: 2026-10-23 23:39:31.308338+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0758f1806fab'
down_revision: Union[str, Sequence[str], None] = '35b9b75afe87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('recurring_payments',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('period', sa.String(length=16), nullable=False),
    sa.Column('anchor_day', sa.SmallInteger(), nullable=False),
    sa.Column('schedule_first_due_date', sa.Date(), nullable=False),
    sa.Column('schedule_from_seq', sa.Integer(), nullable=False),
    sa.Column('department_id', sa.Uuid(), nullable=True),
    sa.Column('stopped_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by_id', sa.Uuid(), nullable=False),
    sa.Column('created_by_login', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("currency in ('RUB', 'USD', 'EUR')", name=op.f('ck_recurring_payments_currency_known')),
    sa.CheckConstraint("period = 'month'", name=op.f('ck_recurring_payments_period_known')),
    sa.CheckConstraint('amount_minor > 0', name=op.f('ck_recurring_payments_amount_positive')),
    sa.CheckConstraint('anchor_day between 1 and 31', name=op.f('ck_recurring_payments_anchor_day_range')),
    sa.CheckConstraint('schedule_from_seq >= 0', name=op.f('ck_recurring_payments_from_seq_non_negative')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recurring_payments'))
    )
    op.create_table('payment_occurrences',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('recurring_payment_id', sa.Uuid(), nullable=False),
    sa.Column('seq', sa.Integer(), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('paid_on', sa.Date(), nullable=True),
    sa.Column('paid_by_id', sa.Uuid(), nullable=True),
    sa.Column('paid_by_login', sa.String(length=255), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("currency in ('RUB', 'USD', 'EUR')", name=op.f('ck_payment_occurrences_currency_known')),
    sa.CheckConstraint('(paid_on is null) = (paid_by_login is null)', name=op.f('ck_payment_occurrences_paid_with_author')),
    sa.CheckConstraint('amount_minor > 0', name=op.f('ck_payment_occurrences_amount_positive')),
    sa.CheckConstraint('seq >= 0', name=op.f('ck_payment_occurrences_seq_non_negative')),
    sa.ForeignKeyConstraint(['recurring_payment_id'], ['recurring_payments.id'], name=op.f('fk_payment_occurrences_recurring_payment_id_recurring_payments')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_payment_occurrences')),
    sa.UniqueConstraint('recurring_payment_id', 'seq', name=op.f('uq_payment_occurrences_recurring_payment_id_seq'))
    )
    op.create_index('ix_payment_occurrences_due_date', 'payment_occurrences', ['due_date'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_payment_occurrences_due_date', table_name='payment_occurrences')
    op.drop_table('payment_occurrences')
    op.drop_table('recurring_payments')
