from app.db import get_db
from app.main import app


def test_health_ok(client):
    response = client.get("/api/grades/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "grades-service", "instance": "test"}


def test_health_degraded_when_db_fails(client):
    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise RuntimeError("db down")

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    response = client.get("/api/grades/health")
    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "service": "grades-service",
        "instance": "test",
    }


def test_docs_under_prefix(client):
    assert client.get("/api/grades/docs").status_code == 200
    assert client.get("/api/grades/openapi.json").status_code == 200
