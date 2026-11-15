import pytest
from pydantic import ValidationError

from app.config import Settings

BASE = {"database_url": "sqlite://", "jwt_secret": "x" * 32}


def test_short_jwt_secret_is_rejected():
    with pytest.raises(ValidationError):
        Settings(database_url="sqlite://", jwt_secret="too-short")


def test_default_weights():
    assert [str(w) for w in Settings(**BASE).weights] == ["0.3", "0.2", "0.5"]


@pytest.mark.parametrize(
    "weights",
    ["0.5,0.5", "0.3,0.3,0.3", "0.5,0.5,0", "1.5,-0.25,-0.25", "a,b,c", "0.2,0.2,0.2,0.4"],
)
def test_invalid_grade_weights_refuse_to_start(weights):
    with pytest.raises(ValidationError):
        Settings(**BASE, grade_weights=weights)


def test_valid_custom_weights():
    assert Settings(**BASE, grade_weights="0.25, 0.25, 0.5").grade_weights == "0.25, 0.25, 0.5"
