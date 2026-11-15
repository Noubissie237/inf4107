import os

# Must be set before the app is imported
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret-with-at-least-32-characters-ok"
os.environ["INSTANCE_ID"] = "test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.storage import LocalStorage, get_storage  # noqa: E402

PASSWORD = "s3cret-pass"
MATRICULE = "20u2671"


@pytest.fixture(scope="session")
def password_hash() -> str:
    return hash_password(PASSWORD)  # bcrypt is slow: compute once


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def db(engine):
    with Session(engine) as session:
        yield session


@pytest.fixture
def user(db, password_hash) -> User:
    user = User(matricule=MATRICULE, full_name="Awa Ndiaye", password_hash=password_hash)
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def storage(tmp_path):
    return LocalStorage(tmp_path)


@pytest.fixture
def client(engine, storage):
    def override_get_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_storage] = lambda: storage
    yield TestClient(app)
    app.dependency_overrides.clear()
