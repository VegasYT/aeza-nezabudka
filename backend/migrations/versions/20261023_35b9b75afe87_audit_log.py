"""audit log

Revision ID: 35b9b75afe87
Revises: 7cc1cd7c356f
Create Date: 2026-10-23 23:09:59.673573+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '35b9b75afe87'
down_revision: Union[str, Sequence[str], None] = '7cc1cd7c356f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('audit_log',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=False),
    sa.Column('actor_login', sa.String(length=255), nullable=False),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('entity', sa.String(length=64), nullable=False),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_log'))
    )
    op.create_index('ix_audit_log_at', 'audit_log', ['at'], unique=False)
    op.create_index('ix_audit_log_entity', 'audit_log', ['entity', 'entity_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_audit_log_entity', table_name='audit_log')
    op.drop_index('ix_audit_log_at', table_name='audit_log')
    op.drop_table('audit_log')
