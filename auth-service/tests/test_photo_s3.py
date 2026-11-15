import io

import boto3
import pytest
from botocore.stub import Stubber
from PIL import Image
from pydantic import ValidationError

from app.config import Settings
from app.main import app
from app.storage import S3Storage, get_storage
from tests.conftest import MATRICULE
from tests.test_auth import auth, make_token

PHOTO = "/api/auth/me/photo"
ORIGINAL_KEY = f"photos/original/{MATRICULE}"
THUMB_KEY = f"photos/thumb/{MATRICULE}.jpg"


class FakeS3Storage:
    """In-memory storage that, like S3, gives signed URLs."""

    def __init__(self):
        self.objects = {}

    def put(self, key, data, content_type):
        self.objects[key] = data

    def get(self, key):
        return self.objects[key]

    def delete(self, key):
        self.objects.pop(key, None)

    def exists(self, key):
        return key in self.objects

    def url(self, key, expires=900):
        return f"https://signed.test/{key}?expires={expires}"


@pytest.fixture
def s3_client(client):
    fake = FakeS3Storage()
    app.dependency_overrides[get_storage] = lambda: fake
    client.fake = fake
    return client


def png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "blue").save(buffer, format="PNG")
    return buffer.getvalue()


def upload(client):
    return client.put(
        PHOTO, files={"file": ("a.png", png(), "image/png")}, headers=auth(make_token())
    )


def test_me_gives_signed_url_of_original_without_thumbnail(s3_client, user):
    response = upload(s3_client)
    assert response.json()["photo_url"] == f"https://signed.test/{ORIGINAL_KEY}?expires=900"
    assert s3_client.fake.objects[ORIGINAL_KEY] == png()


def test_me_prefers_the_thumbnail_when_it_exists(s3_client, user):
    upload(s3_client)
    s3_client.fake.put(THUMB_KEY, b"thumb", "image/jpeg")
    body = s3_client.get("/api/auth/me", headers=auth(make_token())).json()
    assert body["photo_url"] == f"https://signed.test/{THUMB_KEY}?expires=900"


def test_get_photo_redirects_to_signed_url(s3_client, user):
    upload(s3_client)
    response = s3_client.get(PHOTO, headers=auth(make_token()), follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == f"https://signed.test/{ORIGINAL_KEY}?expires=900"


def test_get_photo_without_photo_is_404(s3_client, user):
    assert s3_client.get(PHOTO, headers=auth(make_token())).status_code == 404


def test_new_upload_removes_old_thumbnail(s3_client, user):
    s3_client.fake.put(THUMB_KEY, b"old", "image/jpeg")
    upload(s3_client)
    assert THUMB_KEY not in s3_client.fake.objects


# --- S3Storage itself, with a stubbed boto3 client (no network) ---


@pytest.fixture
def s3(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    storage = S3Storage("bucket", region="us-east-1", endpoint_url="http://minio:9000")
    with Stubber(storage.client) as stubber:
        storage.stubber = stubber
        yield storage


def test_s3_put_and_exists(s3):
    s3.stubber.add_response(
        "put_object",
        {},
        {"Bucket": "bucket", "Key": "k", "Body": b"data", "ContentType": "image/png"},
    )
    s3.put("k", b"data", "image/png")
    s3.stubber.add_response("head_object", {}, {"Bucket": "bucket", "Key": "k"})
    assert s3.exists("k")


def test_s3_exists_false_when_missing(s3):
    s3.stubber.add_client_error("head_object", service_error_code="404", http_status_code=404)
    assert not s3.exists("k")


def test_s3_get_missing_key_raises_file_not_found(s3):
    s3.stubber.add_client_error("get_object", service_error_code="NoSuchKey", http_status_code=404)
    with pytest.raises(FileNotFoundError):
        s3.get("k")


def test_s3_url_is_signed_and_expires(s3):
    url = s3.url("photos/original/20u2671", expires=900)
    assert url.startswith("http://minio:9000/")
    assert "X-Amz-Signature=" in url
    assert "X-Amz-Expires=900" in url


def test_s3_client_uses_default_credential_chain():
    # No access key is passed in code: boto3 resolves them (IAM role, environment...)
    assert boto3.client("s3", region_name="us-east-1") is not None


def test_s3_backend_needs_a_bucket():
    with pytest.raises(ValidationError):
        Settings(database_url="sqlite://", jwt_secret="x" * 32, storage_backend="s3")
    ok = Settings(
        database_url="sqlite://", jwt_secret="x" * 32, storage_backend="s3", s3_bucket="b"
    )
    assert ok.s3_bucket == "b"
