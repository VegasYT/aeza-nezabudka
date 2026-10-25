"""audit entity name

Revision ID: d2cc7087825e
Revises: b9a93e1d79c9
Create Date: 2026-10-24 18:50:48.220974+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2cc7087825e'
down_revision: Union[str, Sequence[str], None] = 'b9a93e1d79c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('audit_log', sa.Column('entity_name', sa.String(length=255), nullable=True))
    # у старых записей название берётся из подробностей, если оно там есть
    op.execute("update audit_log set entity_name = coalesce(details->>'name', details->>'email', details->>'title', details->'after'->>'name')")
    op.alter_column('audit_log', 'at', server_default=sa.text('clock_timestamp()'))


def downgrade() -> None:
    op.alter_column('audit_log', 'at', server_default=sa.text('now()'))
    op.drop_column('audit_log', 'entity_name')
