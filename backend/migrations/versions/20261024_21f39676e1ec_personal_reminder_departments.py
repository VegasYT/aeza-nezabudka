"""personal reminder departments

Revision ID: 21f39676e1ec
Revises: 04f2c83ad8b4
Create Date: 2026-10-24 17:33:03.470076+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '21f39676e1ec'
down_revision: Union[str, Sequence[str], None] = '04f2c83ad8b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('telegram_link_departments',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('department_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], name=op.f('fk_telegram_link_departments_department_id_departments'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['telegram_links.user_id'], name=op.f('fk_telegram_link_departments_user_id_telegram_links'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'department_id', name=op.f('pk_telegram_link_departments'))
    )
    op.add_column('telegram_links', sa.Column('all_departments', sa.Boolean(), server_default=sa.text('true'), nullable=False))


def downgrade() -> None:
    op.drop_column('telegram_links', 'all_departments')
    op.drop_table('telegram_link_departments')
