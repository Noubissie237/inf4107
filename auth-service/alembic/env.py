from alembic import context
from app.db import get_engine, wait_for_db
from app.models import Base

target_metadata = Base.metadata

wait_for_db()
with get_engine().connect() as connection:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()
