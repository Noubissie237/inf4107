"""create courses and grades tables

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("semester", sa.String(), nullable=False),
        sa.CheckConstraint("credits > 0", name="ck_courses_credits_positive"),
    )
    op.create_table(
        "grades",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("matricule", sa.String(), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("cc", sa.Numeric(4, 2), nullable=True),
        sa.Column("tp", sa.Numeric(4, 2), nullable=True),
        sa.Column("sn", sa.Numeric(4, 2), nullable=True),
        sa.UniqueConstraint("matricule", "course_id", name="uq_grades_matricule_course"),
        sa.CheckConstraint("cc IS NULL OR (cc >= 0 AND cc <= 20)", name="ck_grades_cc_range"),
        sa.CheckConstraint("tp IS NULL OR (tp >= 0 AND tp <= 20)", name="ck_grades_tp_range"),
        sa.CheckConstraint("sn IS NULL OR (sn >= 0 AND sn <= 20)", name="ck_grades_sn_range"),
    )
    op.create_index("ix_grades_matricule", "grades", ["matricule"])


def downgrade() -> None:
    op.drop_index("ix_grades_matricule", table_name="grades")
    op.drop_table("grades")
    op.drop_table("courses")
