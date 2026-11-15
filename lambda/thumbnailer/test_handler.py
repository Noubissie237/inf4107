import io
from unittest.mock import MagicMock

import pytest
from PIL import Image

import handler


def image_bytes(fmt, size, mode="RGB"):
    buffer = io.BytesIO()
    Image.new(mode, size, "red").save(buffer, format=fmt)
    return buffer.getvalue()


def event(*keys):
    return {"Records": [{"s3": {"bucket": {"name": "b"}, "object": {"key": key}}} for key in keys]}


@pytest.fixture
def fake_s3(monkeypatch):
    client = MagicMock()
    monkeypatch.setattr(handler, "s3", client)
    return client


def stored_thumbnail(fake_s3):
    kwargs = fake_s3.put_object.call_args.kwargs
    return kwargs, Image.open(io.BytesIO(kwargs["Body"]))


def test_creates_square_jpeg_thumbnail(fake_s3):
    fake_s3.get_object.return_value = {"Body": io.BytesIO(image_bytes("PNG", (400, 200)))}
    result = handler.lambda_handler(event("photos/original/20u2671"), None)
    assert result == {"created": ["photos/thumb/20u2671.jpg"]}
    kwargs, thumb = stored_thumbnail(fake_s3)
    assert kwargs["Bucket"] == "b"
    assert kwargs["Key"] == "photos/thumb/20u2671.jpg"
    assert kwargs["ContentType"] == "image/jpeg"
    assert thumb.format == "JPEG"
    assert thumb.size == (128, 128)


def test_size_is_configurable_and_rgba_is_supported(fake_s3, monkeypatch):
    monkeypatch.setenv("THUMB_SIZE", "64")
    fake_s3.get_object.return_value = {"Body": io.BytesIO(image_bytes("PNG", (10, 30), "RGBA"))}
    handler.lambda_handler(event("photos/original/20u2671"), None)
    assert stored_thumbnail(fake_s3)[1].size == (64, 64)


def test_other_keys_are_ignored_to_avoid_a_loop(fake_s3):
    result = handler.lambda_handler(
        event("photos/thumb/20u2671.jpg", "other/file.png", "photos/originals/x"), None
    )
    assert result == {"created": []}
    fake_s3.get_object.assert_not_called()
    fake_s3.put_object.assert_not_called()


def test_url_encoded_key_is_decoded(fake_s3):
    fake_s3.get_object.return_value = {"Body": io.BytesIO(image_bytes("JPEG", (50, 50)))}
    handler.lambda_handler(event("photos/original/20u%2B2671"), None)
    assert fake_s3.get_object.call_args.kwargs["Key"] == "photos/original/20u+2671"
