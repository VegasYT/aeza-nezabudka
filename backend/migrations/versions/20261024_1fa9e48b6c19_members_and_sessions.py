"""members and sessions

Revision ID: 1fa9e48b6c19
Revises: ed9ed5f5b012
Create Date: 2026-10-24 13:47:47.748418+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1fa9e48b6c19'
down_revision: Union[str, Sequence[str], None] = 'ed9ed5f5b012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('login_failures',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('scope', sa.String(length=320), nullable=False),
    sa.Column('failed_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_login_failures'))
    )
    op.create_index('ix_login_failures_scope_failed_at', 'login_failures', ['scope', 'failed_at'], unique=False)
    op.create_table('members',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('aeza_account_id', sa.BigInteger(), nullable=True),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('source', sa.String(length=8), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("role in ('admin', 'user', 'integration')", name=op.f('ck_members_role_known')),
    sa.CheckConstraint("source in ('env', 'panel')", name=op.f('ck_members_source_known')),
    sa.CheckConstraint('email = lower(email)', name=op.f('ck_members_email_lowercase')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_members')),
    sa.UniqueConstraint('aeza_account_id', name=op.f('uq_members_aeza_account_id')),
    sa.UniqueConstraint('email', name=op.f('uq_members_email'))
    )
    op.create_table('sessions',
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('member_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], name=op.f('fk_sessions_member_id_members'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('token_hash', name=op.f('pk_sessions'))
    )
    op.create_index('ix_sessions_expires_at', 'sessions', ['expires_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_sessions_expires_at', table_name='sessions')
    op.drop_table('sessions')
    op.drop_table('members')
    op.drop_index('ix_login_failures_scope_failed_at', table_name='login_failures')
    op.drop_table('login_failures')
