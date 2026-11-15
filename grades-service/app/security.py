import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

ALGORITHM = "HS256"

bearer_scheme = HTTPBearer(auto_error=False)


def unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Non authentifié",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_matricule(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """Verify the JWT locally (shared secret) and return its `sub` claim."""
    if credentials is None:
        raise unauthenticated()
    try:
        payload = jwt.decode(
            credentials.credentials,
            get_settings().jwt_secret,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        raise unauthenticated() from None
    return payload["sub"]
