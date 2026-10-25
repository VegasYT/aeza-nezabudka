"""panel screens

Revision ID: b9a93e1d79c9
Revises: 5bc080a3b27f
Create Date: 2026-10-24 18:29:21.378550+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9a93e1d79c9'
down_revision: Union[str, Sequence[str], None] = '5bc080a3b27f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(op.f('uq_departments_name'), 'departments', type_='unique')
    op.create_index('uq_departments_name_lower', 'departments', [sa.text('lower(name)')], unique=True)
    op.add_column('members', sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('telegram_links', sa.Column('telegram_name', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('telegram_links', 'telegram_name')
    op.drop_column('members', 'last_seen_at')
    op.drop_index('uq_departments_name_lower', table_name='departments')
    op.create_unique_constraint(op.f('uq_departments_name'), 'departments', ['name'], postgresql_nulls_not_distinct=False)
