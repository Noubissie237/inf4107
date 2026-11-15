import io

import pytest
from PIL import Image

from tests.conftest import MATRICULE
from tests.test_auth import auth, make_token

PHOTO = "/api/auth/me/photo"
ORIGINAL_KEY = f"photos/original/{MATRICULE}"
THUMB_KEY = f"photos/thumb/{MATRICULE}.jpg"


def image_bytes(fmt="PNG", size=(32, 32)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "red").save(buffer, format=fmt)
    return buffer.getvalue()


def upload(client, data, filename="photo.jpg", content_type="image/jpeg", token=None):
    return client.put(
        PHOTO,
        files={"file": (filename, data, content_type)},
        headers=auth(token or make_token()),
    )


@pytest.mark.parametrize(("fmt", "content_type"), [("JPEG", "image/jpeg"), ("PNG", "image/png")])
def test_upload_valid_image(client, user, storage, fmt, content_type):
    data = image_bytes(fmt)
    response = upload(client, data)
    assert response.status_code == 200
    assert response.json() == {
        "matricule": MATRICULE,
        "full_name": "Awa Ndiaye",
        "photo_url": PHOTO,
    }
    assert storage.get(ORIGINAL_KEY) == data  # stored as is
    got = client.get(PHOTO, headers=auth(make_token()))
    assert got.status_code == 200
    assert got.content == data
    assert got.headers["content-type"] == content_type


def test_content_type_comes_from_detected_format(client, user):
    upload(client, image_bytes("PNG"), filename="a.gif", content_type="image/gif")
    assert client.get(PHOTO, headers=auth(make_token())).headers["content-type"] == "image/png"


def test_me_shows_photo_url_after_upload(client, user):
    assert client.get("/api/auth/me", headers=auth(make_token())).json()["photo_url"] is None
    upload(client, image_bytes())
    assert client.get("/api/auth/me", headers=auth(make_token())).json()["photo_url"] == PHOTO


def test_gif_is_refused(client, user):
    response = upload(client, image_bytes("GIF"), filename="a.gif", content_type="image/gif")
    assert response.status_code == 415
    assert response.json() == {"detail": "Format non supporté (JPEG ou PNG uniquement)"}


def test_text_file_renamed_jpg_is_refused(client, user):
    response = upload(client, b"just some text", filename="fake.jpg")
    assert response.status_code == 415


def test_truncated_image_is_refused(client, user):
    assert upload(client, image_bytes("PNG", (200, 200))[:80]).status_code == 415


def test_too_large_file(client, user):
    response = upload(client, b"x" * (2 * 1024 * 1024 + 1))
    assert response.status_code == 413
    assert response.json() == {"detail": "Photo trop volumineuse (2 Mo maximum)"}


def test_file_of_exactly_2_mio_is_not_too_large(client, user):
    # not a valid image, so refused for its format and not for its size
    assert upload(client, b"x" * (2 * 1024 * 1024)).status_code == 415


def test_too_many_pixels(client, user):
    assert upload(client, image_bytes("PNG", (4001, 10))).status_code == 422
    assert upload(client, image_bytes("PNG", (10, 4001))).status_code == 422
    assert upload(client, image_bytes("PNG", (4000, 10))).status_code == 200


def test_replace_photo_and_remove_old_thumbnail(client, user, storage):
    upload(client, image_bytes("JPEG"))
    storage.put(THUMB_KEY, b"old thumbnail", "image/jpeg")
    png = image_bytes("PNG")
    assert upload(client, png).status_code == 200
    assert not storage.exists(THUMB_KEY)
    got = client.get(PHOTO, headers=auth(make_token()))
    assert got.content == png
    assert got.headers["content-type"] == "image/png"


def test_get_photo_without_photo(client, user):
    response = client.get(PHOTO, headers=auth(make_token()))
    assert response.status_code == 404
    assert response.json() == {"detail": "Aucune photo de profil"}


def test_photo_routes_require_token(client, user):
    assert client.get(PHOTO).status_code == 401
    response = client.put(PHOTO, files={"file": ("a.png", image_bytes(), "image/png")})
    assert response.status_code == 401


def test_missing_file_field(client, user):
    assert client.put(PHOTO, headers=auth(make_token())).status_code == 422
