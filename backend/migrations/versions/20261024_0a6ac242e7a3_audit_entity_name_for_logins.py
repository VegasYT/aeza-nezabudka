"""audit entity name for logins

Revision ID: 0a6ac242e7a3
Revises: d2cc7087825e
Create Date: 2026-10-24 19:08:32.845554+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0a6ac242e7a3'
down_revision: Union[str, Sequence[str], None] = 'd2cc7087825e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # вход и выход записывает сам участник: название записи - его email, он же автор
    op.execute(
        "update audit_log set entity_name = actor_login "
        "where entity_name is null and action like 'auth.%' and entity = 'member'"
    )
    # платежи и периоды - по текущему названию платежа, если он ещё есть
    op.execute(
        "update audit_log a set entity_name = p.name from recurring_payments p "
        "where a.entity_name is null and a.entity = 'payment' and a.entity_id = p.id::text"
    )
    op.execute(
        "update audit_log a set entity_name = p.name "
        "from payment_occurrences o join recurring_payments p on p.id = o.recurring_payment_id "
        "where a.entity_name is null and a.entity = 'occurrence' and a.entity_id = o.id::text"
    )


def downgrade() -> None:
    # заполненное название не мешает прежней схеме
    pass
