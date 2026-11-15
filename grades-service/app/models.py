from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (CheckConstraint("credits > 0", name="ck_courses_credits_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, unique=True)
    title: Mapped[str] = mapped_column(String)
    credits: Mapped[int]
    semester: Mapped[str] = mapped_column(String)


class Grade(Base):
    __tablename__ = "grades"
    __table_args__ = (
        UniqueConstraint("matricule", "course_id", name="uq_grades_matricule_course"),
        CheckConstraint("cc IS NULL OR (cc >= 0 AND cc <= 20)", name="ck_grades_cc_range"),
        CheckConstraint("tp IS NULL OR (tp >= 0 AND tp <= 20)", name="ck_grades_tp_range"),
        CheckConstraint("sn IS NULL OR (sn >= 0 AND sn <= 20)", name="ck_grades_sn_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    matricule: Mapped[str] = mapped_column(String, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    cc: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    tp: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    sn: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
