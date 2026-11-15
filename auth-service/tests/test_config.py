import pytest
from pydantic import ValidationError

from app.config import Settings


def test_short_jwt_secret_is_rejected():
    with pytest.raises(ValidationError):
        Settings(database_url="sqlite://", jwt_secret="too-short")


def test_cors_origins_are_split():
    settings = Settings(
        database_url="sqlite://", jwt_secret="x" * 32, cors_origins="http://a.com, http://b.com"
    )
    assert settings.cors_origin_list == ["http://a.com", "http://b.com"]
