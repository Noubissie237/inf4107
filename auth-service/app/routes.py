import io
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, Response
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserOut
from app.security import (
    DUMMY_HASH,
    create_access_token,
    get_current_user,
    verify_password,
)
from app.storage import Storage, get_storage

logger = logging.getLogger(__name__)

router = APIRouter()

PHOTO_URL = "/api/auth/me/photo"
MAX_PHOTO_BYTES = 2 * 1024 * 1024
MAX_PHOTO_SIDE = 4000
CONTENT_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png"}


def signed_url(user: User, storage: Storage) -> str | None:
    """Signed URL of the thumbnail if it exists, else of the original (None in local mode)."""
    url = storage.url(user.photo_key)
    if url is None:
        return None
    thumb_key = f"photos/thumb/{user.matricule}.jpg"
    return storage.url(thumb_key) if storage.exists(thumb_key) else url


def user_out(user: User, storage: Storage) -> UserOut:
    photo_url = None
    if user.photo_key:
        photo_url = signed_url(user, storage) or PHOTO_URL
    return UserOut(matricule=user.matricule, full_name=user.full_name, photo_url=photo_url)


def validate_image(data: bytes) -> str:
    """Return the content type detected by Pillow, or raise the matching HTTP error."""
    unsupported = HTTPException(415, "Format non supporté (JPEG ou PNG uniquement)")
    try:
        with Image.open(io.BytesIO(data)) as image:
            content_type = CONTENT_TYPES.get(image.format)
            if content_type is None:
                raise unsupported
            width, height = image.size
            image.verify()
    except Image.DecompressionBombError:
        raise HTTPException(422, "Dimensions trop grandes (4000 x 4000 maximum)") from None
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise unsupported from None
    if width > MAX_PHOTO_SIDE or height > MAX_PHOTO_SIDE:
        raise HTTPException(422, "Dimensions trop grandes (4000 x 4000 maximum)")
    return content_type


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.matricule == body.matricule))
    password_ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not password_ok:
        # Same answer for an unknown matricule and a wrong password
        raise HTTPException(status_code=401, detail="Matricule ou mot de passe incorrect")
    token, expires_in = create_access_token(user)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), storage: Storage = Depends(get_storage)):
    return user_out(user, storage)


@router.put("/me/photo", response_model=UserOut)
def upload_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    data = file.file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Photo trop volumineuse (2 Mo maximum)")
    # Content type comes from the detected format, never from the client header
    content_type = validate_image(data)

    key = f"photos/original/{user.matricule}"
    storage.put(key, data, content_type)
    # Drop the old thumbnail so the previous picture is not shown
    storage.delete(f"photos/thumb/{user.matricule}.jpg")
    user.photo_key = key
    user.photo_content_type = content_type
    db.commit()
    return user_out(user, storage)


@router.get("/me/photo")
def get_photo(user: User = Depends(get_current_user), storage: Storage = Depends(get_storage)):
    no_photo = HTTPException(404, "Aucune photo de profil")
    if not user.photo_key:
        raise no_photo
    url = signed_url(user, storage)
    if url:
        return RedirectResponse(url, status_code=307)
    try:
        data = storage.get(user.photo_key)
    except FileNotFoundError:
        raise no_photo from None
    return Response(content=data, media_type=user.photo_content_type)


@router.get("/health")
def health(db: Session = Depends(get_db)):
    body = {"status": "ok", "service": "auth-service", "instance": get_settings().instance_id}
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: database unreachable")
        return JSONResponse({**body, "status": "degraded"}, status_code=503)
    return body
