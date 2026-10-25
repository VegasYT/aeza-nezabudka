"""telegram link member disabled

Revision ID: 5bc080a3b27f
Revises: 21f39676e1ec
Create Date: 2026-10-24 18:20:49.283495+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5bc080a3b27f'
down_revision: Union[str, Sequence[str], None] = '21f39676e1ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('telegram_links', sa.Column('member_disabled', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    # участники, отключённые до этой миграции, тоже перестают получать личные напоминания
    op.execute("update telegram_links set member_disabled = true where user_id in (select id from members where not enabled)")


def downgrade() -> None:
    op.drop_column('telegram_links', 'member_disabled')
