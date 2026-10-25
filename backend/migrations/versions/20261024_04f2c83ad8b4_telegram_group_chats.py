"""telegram group chats

Revision ID: 04f2c83ad8b4
Revises: 1fa9e48b6c19
Create Date: 2026-10-24 17:05:57.819537+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '04f2c83ad8b4'
down_revision: Union[str, Sequence[str], None] = '1fa9e48b6c19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('telegram_chats',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('chat_id', sa.BigInteger(), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('all_departments', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('linked_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('blocked_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_telegram_chats')),
    sa.UniqueConstraint('chat_id', name=op.f('uq_telegram_chats_chat_id'))
    )
    op.create_table('telegram_chat_departments',
    sa.Column('chat_id', sa.Uuid(), nullable=False),
    sa.Column('department_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['chat_id'], ['telegram_chats.id'], name=op.f('fk_telegram_chat_departments_chat_id_telegram_chats'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], name=op.f('fk_telegram_chat_departments_department_id_departments'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('chat_id', 'department_id', name=op.f('pk_telegram_chat_departments'))
    )
    op.add_column('telegram_link_codes', sa.Column('purpose', sa.String(length=16), server_default='personal', nullable=False))
    op.create_check_constraint(op.f('ck_telegram_link_codes_purpose_known'), 'telegram_link_codes', "purpose in ('personal', 'group')")


def downgrade() -> None:
    op.drop_constraint(op.f('ck_telegram_link_codes_purpose_known'), 'telegram_link_codes', type_='check')
    op.drop_column('telegram_link_codes', 'purpose')
    op.drop_table('telegram_chat_departments')
    op.drop_table('telegram_chats')
