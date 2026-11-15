from pydantic import BaseModel


class CourseGrades(BaseModel):
    code: str
    title: str
    credits: int
    cc: float | None
    tp: float | None
    sn: float | None
    average: float | None


class GradesResponse(BaseModel):
    matricule: str
    semester: str
    courses: list[CourseGrades]
