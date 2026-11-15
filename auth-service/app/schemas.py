import re

from pydantic import BaseModel, Field, field_validator

MATRICULE_RE = re.compile(r"^\d{2}u\d{4}$")


class LoginRequest(BaseModel):
    matricule: str
    password: str = Field(min_length=1, max_length=128)

    @field_validator("matricule")
    @classmethod
    def normalize_matricule(cls, value: str) -> str:
        value = value.strip().lower()
        if not MATRICULE_RE.match(value):
            raise ValueError("Format de matricule invalide")
        return value


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    matricule: str
    full_name: str
    photo_url: str | None = None
