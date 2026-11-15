import logging
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Course, Grade
from app.schemas import CourseGrades, GradesResponse
from app.security import get_current_matricule

logger = logging.getLogger(__name__)

router = APIRouter()


def compute_average(cc: Decimal | None, tp: Decimal | None, sn: Decimal | None) -> float | None:
    """Weighted average, only when the three grades exist."""
    if cc is None or tp is None or sn is None:
        return None
    w_cc, w_tp, w_sn = get_settings().weights
    average = w_cc * cc + w_tp * tp + w_sn * sn
    return float(average.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def to_float(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


@router.get("/me/grades", response_model=GradesResponse)
def my_grades(
    semester: str = Query("S1", pattern=r"^S[1-9]$"),
    matricule: str = Depends(get_current_matricule),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(Course, Grade)
        .join(Grade, Grade.course_id == Course.id)
        .where(Grade.matricule == matricule, Course.semester == semester)
        .order_by(Course.code)
    ).all()
    courses = [
        CourseGrades(
            code=course.code,
            title=course.title,
            credits=course.credits,
            cc=to_float(grade.cc),
            tp=to_float(grade.tp),
            sn=to_float(grade.sn),
            average=compute_average(grade.cc, grade.tp, grade.sn),
        )
        for course, grade in rows
    ]
    return GradesResponse(matricule=matricule, semester=semester, courses=courses)


@router.get("/health")
def health(db: Session = Depends(get_db)):
    body = {"status": "ok", "service": "grades-service", "instance": get_settings().instance_id}
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: database unreachable")
        return JSONResponse({**body, "status": "degraded"}, status_code=503)
    return body
