"""telegram links

Revision ID: a5dcdd3c0df3
Revises: 3279087a5b04
Create Date: 2026-10-24 10:03:36.936817+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a5dcdd3c0df3'
down_revision: Union[str, Sequence[str], None] = '3279087a5b04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('telegram_link_codes',
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('login', sa.String(length=255), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('code_hash', name=op.f('pk_telegram_link_codes'))
    )
    op.create_index('ix_telegram_link_codes_user_id', 'telegram_link_codes', ['user_id'], unique=False)
    op.create_table('telegram_links',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('login', sa.String(length=255), nullable=False),
    sa.Column('chat_id', sa.BigInteger(), nullable=False),
    sa.Column('telegram_username', sa.String(length=64), nullable=True),
    sa.Column('personal_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('linked_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('blocked_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('user_id', name=op.f('pk_telegram_links')),
    sa.UniqueConstraint('chat_id', name=op.f('uq_telegram_links_chat_id'))
    )


def downgrade() -> None:
    op.drop_table('telegram_links')
    op.drop_index('ix_telegram_link_codes_user_id', table_name='telegram_link_codes')
    op.drop_table('telegram_link_codes')
