from app.db import get_db
from app.main import app


def test_health_ok(client):
    response = client.get("/api/auth/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "auth-service", "instance": "test"}


def test_health_degraded_when_db_fails(client):
    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise RuntimeError("db down")

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    response = client.get("/api/auth/health")
    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "service": "auth-service",
        "instance": "test",
    }


def test_docs_under_prefix(client):
    assert client.get("/api/auth/docs").status_code == 200
    assert client.get("/api/auth/openapi.json").status_code == 200
