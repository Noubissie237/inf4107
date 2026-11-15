import logging
import time
from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        pool_pre_ping=True,
    )


def wait_for_db(timeout: float = 30, interval: float = 1) -> None:
    """Retry until the database answers: in the cloud it can start after the container."""
    deadline = time.monotonic() + timeout
    while True:
        try:
            with get_engine().connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except OperationalError:
            if time.monotonic() >= deadline:
                raise
            logger.warning("Database not ready, retrying...")
            time.sleep(interval)


def get_db() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
