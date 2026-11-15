from decimal import Decimal, InvalidOperation
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


def parse_weights(value: str) -> tuple[Decimal, Decimal, Decimal]:
    """Parse 'CC,TP,SN' into three positive Decimals whose sum is 1."""
    try:
        weights = tuple(Decimal(part.strip()) for part in value.split(","))
    except InvalidOperation:
        raise ValueError("GRADE_WEIGHTS doit contenir trois nombres") from None
    if len(weights) != 3 or any(w <= 0 for w in weights) or sum(weights) != 1:
        raise ValueError("GRADE_WEIGHTS doit contenir trois nombres positifs de somme 1")
    return weights


class Settings(BaseSettings):
    """All configuration comes from environment variables."""

    database_url: str
    jwt_secret: str = Field(min_length=32)
    instance_id: str = "local"
    cors_origins: str = "http://localhost:8080,http://localhost:3000"
    log_level: str = "INFO"
    db_pool_size: int = 5
    grade_weights: str = "0.3,0.2,0.5"

    @field_validator("grade_weights")
    @classmethod
    def check_grade_weights(cls, value: str) -> str:
        parse_weights(value)
        return value

    @property
    def weights(self) -> tuple[Decimal, Decimal, Decimal]:
        return parse_weights(self.grade_weights)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
