from datetime import UTC, datetime, timedelta

import jwt

from app.config import get_settings
from tests.conftest import MATRICULE, PASSWORD

LOGIN = "/api/auth/login"
ME = "/api/auth/me"


def make_token(sub=MATRICULE, secret=None, expires_in=3600):
    now = datetime.now(UTC)
    claims = {"sub": sub, "name": "X", "iat": now, "exp": now + timedelta(seconds=expires_in)}
    return jwt.encode(claims, secret or get_settings().jwt_secret, algorithm="HS256")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_success(client, user):
    response = client.post(LOGIN, json={"matricule": MATRICULE, "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 3600
    claims = jwt.decode(body["access_token"], get_settings().jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == MATRICULE
    assert claims["name"] == "Awa Ndiaye"
    assert "iat" in claims and "exp" in claims


def test_login_normalizes_matricule(client, user):
    response = client.post(LOGIN, json={"matricule": "  20U2671 ", "password": PASSWORD})
    assert response.status_code == 200


def test_login_unknown_and_wrong_password_look_the_same(client, user):
    unknown = client.post(LOGIN, json={"matricule": "20u9999", "password": PASSWORD})
    wrong = client.post(LOGIN, json={"matricule": MATRICULE, "password": "nope"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json() == {"detail": "Matricule ou mot de passe incorrect"}


def test_login_invalid_matricule_format(client):
    for bad in ["abc", "2671", "20x2671", "20u267", "20u26711"]:
        response = client.post(LOGIN, json={"matricule": bad, "password": "x"})
        assert response.status_code == 422, bad


def test_me_with_valid_token(client, user):
    response = client.get(ME, headers=auth(make_token()))
    assert response.status_code == 200
    assert response.json() == {
        "matricule": MATRICULE,
        "full_name": "Awa Ndiaye",
        "photo_url": None,
    }


def test_me_without_token(client, user):
    response = client.get(ME)
    assert response.status_code == 401
    assert response.json() == {"detail": "Non authentifié"}
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_me_with_expired_token(client, user):
    response = client.get(ME, headers=auth(make_token(expires_in=-10)))
    assert response.status_code == 401
    assert response.json() == {"detail": "Non authentifié"}


def test_me_with_forged_token(client, user):
    forged = make_token(secret="another-secret-that-is-long-enough-123456")
    assert client.get(ME, headers=auth(forged)).status_code == 401
    assert client.get(ME, headers=auth("not-a-jwt")).status_code == 401


def test_me_user_deleted(client, user, db):
    token = make_token()
    db.delete(user)
    db.commit()
    assert client.get(ME, headers=auth(token)).status_code == 401


def test_login_then_me(client, user):
    token = client.post(LOGIN, json={"matricule": MATRICULE, "password": PASSWORD}).json()[
        "access_token"
    ]
    assert client.get(ME, headers=auth(token)).status_code == 200
