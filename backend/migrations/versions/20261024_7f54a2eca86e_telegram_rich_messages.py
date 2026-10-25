"""telegram rich messages

Revision ID: 7f54a2eca86e
Revises: 66dfbc277b6b
Create Date: 2026-10-24 22:05:43.417120+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7f54a2eca86e'
down_revision: Union[str, Sequence[str], None] = '66dfbc277b6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notifications', sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True))
    # старые сообщения - простой текст без кнопок: в итог их не переписываем
    op.execute("update notifications set closed_at = now() where state = 'sent'")
    op.drop_constraint(op.f('ck_notifications_kind_known'), 'notifications', type_='check')
    op.create_check_constraint(op.f('ck_notifications_kind_known'), 'notifications', "kind in ('due_soon', 'overdue', 'created')")
    op.add_column('telegram_chats', sa.Column('thread_id', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('telegram_chats', 'thread_id')
    op.drop_constraint(op.f('ck_notifications_kind_known'), 'notifications', type_='check')
    op.execute("delete from notifications where kind = 'created'")
    op.create_check_constraint(op.f('ck_notifications_kind_known'), 'notifications', "kind in ('due_soon', 'overdue')")
    op.drop_column('notifications', 'closed_at')
