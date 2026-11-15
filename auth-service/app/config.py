from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All configuration comes from environment variables."""

    database_url: str
    jwt_secret: str = Field(min_length=32)
    jwt_expire_minutes: int = 60
    instance_id: str = "local"
    cors_origins: str = "http://localhost:8080,http://localhost:3000"
    log_level: str = "INFO"
    db_pool_size: int = 5
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_dir: str = "/data/photos"
    s3_bucket: str = ""
    s3_region: str = ""
    s3_endpoint_url: str = ""  # optional custom endpoint (MinIO)

    @model_validator(mode="after")
    def check_s3_settings(self):
        if self.storage_backend == "s3" and not self.s3_bucket:
            raise ValueError("S3_BUCKET est obligatoire quand STORAGE_BACKEND=s3")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
