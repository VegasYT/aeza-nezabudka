"""telegram chat topics

Revision ID: 5a7e1834fe50
Revises: 7f54a2eca86e
Create Date: 2026-10-24 22:25:01.187444+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5a7e1834fe50'
down_revision: Union[str, Sequence[str], None] = '7f54a2eca86e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('telegram_chats', sa.Column('topic_name', sa.String(length=128), nullable=True))
    op.add_column('telegram_link_codes', sa.Column('general_asked_at', sa.DateTime(timezone=True), nullable=True))
    op.drop_constraint(op.f('uq_telegram_chats_chat_id'), 'telegram_chats', type_='unique')
    op.create_unique_constraint(op.f('uq_telegram_chats_chat_id_thread_id'), 'telegram_chats', ['chat_id', 'thread_id'], postgresql_nulls_not_distinct=True)


def downgrade() -> None:
    op.drop_constraint(op.f('uq_telegram_chats_chat_id_thread_id'), 'telegram_chats', type_='unique')
    # прежняя схема - одно подключение на группу: оставляем самое раннее
    op.execute(
        "delete from telegram_chats c using telegram_chats e "
        "where c.chat_id = e.chat_id and (c.linked_at, c.id) > (e.linked_at, e.id)"
    )
    op.create_unique_constraint(op.f('uq_telegram_chats_chat_id'), 'telegram_chats', ['chat_id'], postgresql_nulls_not_distinct=False)
    op.drop_column('telegram_link_codes', 'general_asked_at')
    op.drop_column('telegram_chats', 'topic_name')
