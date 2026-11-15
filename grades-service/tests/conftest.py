import os
from datetime import UTC, datetime, timedelta

# Must be set before the app is imported
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret-with-at-least-32-characters-ok"
os.environ["INSTANCE_ID"] = "test"

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, Course, Grade  # noqa: E402

MATRICULE = "20u2671"


def make_token(sub=MATRICULE, secret=None, expires_in=3600) -> str:
    now = datetime.now(UTC)
    claims = {"sub": sub, "name": "X", "iat": now, "exp": now + timedelta(seconds=expires_in)}
    return jwt.encode(claims, secret or get_settings().jwt_secret, algorithm="HS256")


def auth(sub=MATRICULE) -> dict:
    return {"Authorization": f"Bearer {make_token(sub)}"}


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
def courses(db) -> dict[str, Course]:
    items = [
        Course(code="INF4102", title="Bases de données avancées", credits=4, semester="S1"),
        Course(code="INF4101", title="Génie logiciel avancé", credits=4, semester="S1"),
        Course(code="INF4201", title="Cours de S2", credits=3, semester="S2"),
    ]
    db.add_all(items)
    db.commit()
    return {course.code: course for course in items}


def add_grade(db, course, matricule=MATRICULE, cc=None, tp=None, sn=None):
    db.add(Grade(matricule=matricule, course_id=course.id, cc=cc, tp=tp, sn=sn))
    db.commit()


@pytest.fixture
def client(engine):
    def override_get_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
