"""AWS Lambda: create a square thumbnail when a profile photo is uploaded to S3.

Trigger: S3 "ObjectCreated" events. Only keys under photos/original/ are handled;
the thumbnail goes to photos/thumb/<matricule>.jpg, so it never triggers itself.
"""

import io
import logging
import os
from urllib.parse import unquote_plus

import boto3
from PIL import Image, ImageOps

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ORIGINAL_PREFIX = "photos/original/"
THUMB_KEY = "photos/thumb/{matricule}.jpg"

s3 = boto3.client("s3")  # credentials: the function's IAM role


def make_thumbnail(data: bytes, size: int) -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        thumb = ImageOps.fit(image, (size, size))  # center crop, then resize
    output = io.BytesIO()
    thumb.save(output, format="JPEG", quality=85)
    return output.getvalue()


def lambda_handler(event, context):
    size = int(os.environ.get("THUMB_SIZE", "128"))
    created = []
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = unquote_plus(record["s3"]["object"]["key"])
        if not key.startswith(ORIGINAL_PREFIX):
            logger.info("Ignoring key %s", key)
            continue
        matricule = key[len(ORIGINAL_PREFIX) :]
        data = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        thumb_key = THUMB_KEY.format(matricule=matricule)
        s3.put_object(
            Bucket=bucket, Key=thumb_key, Body=make_thumbnail(data, size), ContentType="image/jpeg"
        )
        logger.info("Thumbnail written to %s", thumb_key)
        created.append(thumb_key)
    return {"created": created}
