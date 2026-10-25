"""integrations

Revision ID: ed9ed5f5b012
Revises: d1697b341242
Create Date: 2026-10-24 10:27:29.093059+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'ed9ed5f5b012'
down_revision: Union[str, Sequence[str], None] = 'd1697b341242'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('idempotency_keys',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=False),
    sa.Column('key', sa.String(length=128), nullable=False),
    sa.Column('operation', sa.String(length=64), nullable=False),
    sa.Column('request_hash', sa.String(length=64), nullable=False),
    sa.Column('resource_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_idempotency_keys')),
    sa.UniqueConstraint('actor_id', 'key', name=op.f('uq_idempotency_keys_actor_id_key'))
    )
    op.create_index('ix_idempotency_keys_created_at', 'idempotency_keys', ['created_at'], unique=False)
    op.create_table('integration_events',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('type', sa.String(length=64), nullable=False),
    sa.Column('schema_version', sa.SmallInteger(), nullable=False),
    sa.Column('dedup_key', sa.String(length=128), nullable=True),
    sa.Column('partition_key', sa.String(length=64), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('clock_timestamp()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_integration_events')),
    sa.UniqueConstraint('dedup_key', name=op.f('uq_integration_events_dedup_key'))
    )
    op.create_index('ix_integration_events_created_at', 'integration_events', ['created_at'], unique=False)
    op.create_table('integration_deliveries',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('event_id', sa.Uuid(), nullable=False),
    sa.Column('target', sa.String(length=16), nullable=False),
    sa.Column('state', sa.String(length=16), server_default='pending', nullable=False),
    sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('next_attempt_at', sa.DateTime(timezone=True), server_default=sa.text('clock_timestamp()'), nullable=False),
    sa.Column('last_error', sa.Text(), nullable=True),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("state in ('pending', 'sent', 'failed')", name=op.f('ck_integration_deliveries_state_known')),
    sa.CheckConstraint("target in ('webhook', 'kafka')", name=op.f('ck_integration_deliveries_target_known')),
    sa.ForeignKeyConstraint(['event_id'], ['integration_events.id'], name=op.f('fk_integration_deliveries_event_id_integration_events'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_integration_deliveries')),
    sa.UniqueConstraint('event_id', 'target', name=op.f('uq_integration_deliveries_event_id_target'))
    )
    op.create_index('ix_integration_deliveries_pending', 'integration_deliveries', ['next_attempt_at'], unique=False, postgresql_where=sa.text("state = 'pending'"))


def downgrade() -> None:
    op.drop_index('ix_integration_deliveries_pending', table_name='integration_deliveries', postgresql_where=sa.text("state = 'pending'"))
    op.drop_table('integration_deliveries')
    op.drop_index('ix_integration_events_created_at', table_name='integration_events')
    op.drop_table('integration_events')
    op.drop_index('ix_idempotency_keys_created_at', table_name='idempotency_keys')
    op.drop_table('idempotency_keys')
