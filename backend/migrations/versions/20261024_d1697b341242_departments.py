"""departments

Revision ID: d1697b341242
Revises: a5dcdd3c0df3
Create Date: 2026-10-24 10:18:03.686208+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1697b341242'
down_revision: Union[str, Sequence[str], None] = 'a5dcdd3c0df3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('departments',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_departments')),
    sa.UniqueConstraint('name', name=op.f('uq_departments_name'))
    )
    op.create_foreign_key(op.f('fk_recurring_payments_department_id_departments'), 'recurring_payments', 'departments', ['department_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(op.f('fk_recurring_payments_department_id_departments'), 'recurring_payments', type_='foreignkey')
    op.drop_table('departments')
