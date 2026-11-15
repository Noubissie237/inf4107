from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User

ALGORITHM = "HS256"

# Valid bcrypt hash checked when the matricule is unknown, so that both login failures
# take the same time. Its cost (10) matches the seed default (--bcrypt-rounds).
DUMMY_HASH = "$2b$10$o.T44vHH8th2S6sKxGpcv.Xu.p2n4hJb8Ly3xpdVqf3WD5ql0FLOq"

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode()[:72], password_hash.encode())


def create_access_token(user: User) -> tuple[str, int]:
    settings = get_settings()
    expires_in = settings.jwt_expire_minutes * 60
    now = datetime.now(UTC)
    claims = {
        "sub": user.matricule,
        "name": user.full_name,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=ALGORITHM), expires_in


def unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Non authentifié",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
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
    user = db.scalar(select(User).where(User.matricule == payload["sub"]))
    if user is None:
        raise unauthenticated()
    return user
