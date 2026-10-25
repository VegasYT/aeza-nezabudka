"""notifications

Revision ID: 3279087a5b04
Revises: 0758f1806fab
Create Date: 2026-10-24 09:51:26.251499+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3279087a5b04'
down_revision: Union[str, Sequence[str], None] = '0758f1806fab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('notifications',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('occurrence_id', sa.Uuid(), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('channel', sa.String(length=16), nullable=False),
    sa.Column('recipient', sa.String(length=64), nullable=False),
    sa.Column('state', sa.String(length=16), server_default='pending', nullable=False),
    sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('next_attempt_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_error', sa.Text(), nullable=True),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('external_id', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("kind in ('due_soon', 'overdue')", name=op.f('ck_notifications_kind_known')),
    sa.CheckConstraint("state in ('pending', 'sent', 'cancelled', 'failed')", name=op.f('ck_notifications_state_known')),
    sa.CheckConstraint('attempts >= 0', name=op.f('ck_notifications_attempts_non_negative')),
    sa.ForeignKeyConstraint(['occurrence_id'], ['payment_occurrences.id'], name=op.f('fk_notifications_occurrence_id_payment_occurrences'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications')),
    sa.UniqueConstraint('occurrence_id', 'kind', 'channel', 'recipient', name=op.f('uq_notifications_occurrence_id_kind_channel_recipient'))
    )
    op.create_index('ix_notifications_pending', 'notifications', ['next_attempt_at'], unique=False, postgresql_where=sa.text("state = 'pending'"))


def downgrade() -> None:
    op.drop_index('ix_notifications_pending', table_name='notifications', postgresql_where=sa.text("state = 'pending'"))
    op.drop_table('notifications')
