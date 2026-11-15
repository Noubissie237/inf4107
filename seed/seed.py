"""Fill auth_db and grades_db with fictitious students, courses and grades.

Standalone: plain SQL with psycopg, it does not import the services' code.
Migrations must already have been applied.
"""

import argparse
import os
import random
import re
import sys
from decimal import Decimal

import bcrypt
import psycopg

MATRICULE_RE = re.compile(r"^\d{2}u\d{4}$")

COURSES = [
    ("INF4101", "Génie logiciel avancé", 4),
    ("INF4102", "Bases de données avancées", 4),
    ("INF4103", "Réseaux et sécurité", 3),
    ("INF4104", "Systèmes distribués", 3),
    ("INF4105", "Intelligence artificielle", 3),
    ("INF4106", "Analyse de données", 3),
    ("INF4107", "Cloud computing", 4),
    ("INF4108", "Architecture logicielle", 3),
    ("INF4109", "Méthodologie de recherche", 2),
    ("INF4110", "Anglais technique", 1),
]
SEMESTER = "S1"

FIRST_NAMES = [
    "Awa", "Kofi", "Mireille", "Yannick", "Fatou", "Brice", "Aminata", "Serge",
    "Nadia", "Cédric", "Sandrine", "Moussa", "Estelle", "Idriss", "Carine", "Landry",
]  # fmt: skip
LAST_NAMES = [
    "Ndiaye", "Mbarga", "Tchoupo", "Kamga", "Diallo", "Nkou", "Fotso", "Sow",
    "Essomba", "Talla", "Bello", "Onana", "Keita", "Mvondo", "Nguema", "Traoré",
]  # fmt: skip

MISSING_RATE = 0.03


def random_grade(rng: random.Random) -> Decimal | None:
    """Normal law around 11.5, clamped to [0, 20], rounded to 0.25; sometimes missing."""
    if rng.random() < MISSING_RATE:
        return None
    value = min(20.0, max(0.0, rng.gauss(11.5, 3)))
    return Decimal(round(value * 4)) / 4


def build_students(count: int, my_matricule: str | None) -> list[str]:
    matricules = [f"20u{i:04d}" for i in range(1, count + 1)]
    if my_matricule and my_matricule not in matricules:
        matricules.append(my_matricule)
    return matricules


def build_grades(
    rng: random.Random, matricule: str, my_matricule: str | None
) -> list[list[Decimal | None]]:
    rows = [[random_grade(rng) for _ in range(3)] for _ in COURSES]
    if matricule == my_matricule:
        # Demo account: complete grades, except one missing TP
        rows = [[g if g is not None else Decimal(12) for g in row] for row in rows]
        rows[rng.randrange(len(COURSES))][1] = None
    return rows


def seed_auth(
    url: str, matricules: list[str], password: str, rounds: int, rng: random.Random, reset: bool
):
    # bcrypt is slow: hash once and reuse for all accounts
    password_hash = bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=rounds)).decode()
    users = [
        (m, f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}", password_hash)
        for m in matricules
    ]
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        if reset:
            cur.execute("TRUNCATE users RESTART IDENTITY")
        cur.executemany(
            "INSERT INTO users (matricule, full_name, password_hash, created_at, updated_at) "
            "VALUES (%s, %s, %s, now(), now()) ON CONFLICT (matricule) DO NOTHING",
            users,
        )
    print(f"auth_db: {len(users)} users processed")


def seed_grades(
    url: str, matricules: list[str], my_matricule: str | None, rng: random.Random, reset: bool
):
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        if reset:
            cur.execute("TRUNCATE grades, courses RESTART IDENTITY")
        cur.executemany(
            "INSERT INTO courses (code, title, credits, semester) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (code) DO NOTHING",
            [(code, title, credits, SEMESTER) for code, title, credits in COURSES],
        )
        cur.execute("SELECT code, id FROM courses")
        course_ids = dict(cur.fetchall())

        rows = []
        for matricule in matricules:
            for (code, _, _), (cc, tp, sn) in zip(
                COURSES, build_grades(rng, matricule, my_matricule), strict=True
            ):
                rows.append((matricule, course_ids[code], cc, tp, sn))
        cur.executemany(
            "INSERT INTO grades (matricule, course_id, cc, tp, sn) VALUES (%s, %s, %s, %s, %s) "
            "ON CONFLICT (matricule, course_id) DO NOTHING",
            rows,
        )
    print(f"grades_db: {len(COURSES)} courses, {len(rows)} grade rows processed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--students", type=int, default=2000)
    parser.add_argument("--my-matricule")
    parser.add_argument("--password", default=os.environ.get("SEED_PASSWORD"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--bcrypt-rounds",
        type=int,
        default=int(os.environ.get("BCRYPT_ROUNDS", "10")),
        help="bcrypt cost (4-14, default 10): it sets the CPU cost of every login",
    )
    parser.add_argument("--reset", action="store_true", help="empty the tables first")
    args = parser.parse_args()

    auth_url = os.environ.get("AUTH_DATABASE_URL")
    grades_url = os.environ.get("GRADES_DATABASE_URL")
    if not auth_url or not grades_url:
        sys.exit("AUTH_DATABASE_URL et GRADES_DATABASE_URL sont obligatoires")
    if not args.password:
        sys.exit("Mot de passe manquant : utilisez --password ou SEED_PASSWORD")
    if not 0 <= args.students <= 9999:
        sys.exit("--students doit être compris entre 0 et 9999")
    if not 4 <= args.bcrypt_rounds <= 14:
        sys.exit("--bcrypt-rounds doit être compris entre 4 et 14")
    my_matricule = args.my_matricule.strip().lower() if args.my_matricule else None
    if my_matricule and not MATRICULE_RE.match(my_matricule):
        sys.exit("--my-matricule invalide (format attendu : 20u2671)")

    rng = random.Random(args.seed)
    matricules = build_students(args.students, my_matricule)
    seed_auth(auth_url, matricules, args.password, args.bcrypt_rounds, rng, args.reset)
    seed_grades(grades_url, matricules, my_matricule, rng, args.reset)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
