"""initial schema baseline

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-08
"""

from __future__ import annotations

from alembic import op

from db.session import Base
from models import models as _models  # noqa: F401  # ensure tables are registered

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Baseline schema creation that safely creates any missing tables.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
