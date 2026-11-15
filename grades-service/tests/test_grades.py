import pytest

from tests.conftest import MATRICULE, add_grade, auth, make_token

URL = "/api/grades/me/grades"


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-jwt"},
        {"Authorization": f"Bearer {make_token(expires_in=-10)}"},
        {"Authorization": f"Bearer {make_token(secret='another-secret-that-is-long-enough-1234')}"},
    ],
    ids=["missing", "invalid", "expired", "forged"],
)
def test_requires_valid_token(client, headers):
    response = client.get(URL, headers=headers)
    assert response.status_code == 401
    assert response.json() == {"detail": "Non authentifié"}
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_average_with_three_grades(client, db, courses):
    add_grade(db, courses["INF4101"], cc=14, tp=12, sn=10)
    response = client.get(URL, headers=auth())
    assert response.status_code == 200
    body = response.json()
    assert body["matricule"] == MATRICULE
    assert body["semester"] == "S1"
    assert body["courses"] == [
        {
            "code": "INF4101",
            "title": "Génie logiciel avancé",
            "credits": 4,
            "cc": 14.0,
            "tp": 12.0,
            "sn": 10.0,
            "average": 11.6,  # 0.3*14 + 0.2*12 + 0.5*10
        }
    ]


def test_average_is_rounded_half_up(client, db, courses):
    add_grade(db, courses["INF4101"], cc=13.25, tp=11.75, sn=9.5)  # 11.075 exactly
    course = client.get(URL, headers=auth()).json()["courses"][0]
    assert course["average"] == 11.08


def test_missing_grade_gives_null_average(client, db, courses):
    add_grade(db, courses["INF4101"], cc=14.5, tp=None, sn=12)
    course = client.get(URL, headers=auth()).json()["courses"][0]
    assert course["cc"] == 14.5
    assert course["tp"] is None
    assert course["sn"] == 12.0
    assert course["average"] is None


def test_courses_sorted_by_code_and_filtered_by_semester(client, db, courses):
    add_grade(db, courses["INF4102"], cc=10, tp=10, sn=10)
    add_grade(db, courses["INF4101"], cc=10, tp=10, sn=10)
    add_grade(db, courses["INF4201"], cc=10, tp=10, sn=10)
    s1 = client.get(URL, headers=auth()).json()
    assert [c["code"] for c in s1["courses"]] == ["INF4101", "INF4102"]
    s2 = client.get(URL, params={"semester": "S2"}, headers=auth()).json()
    assert [c["code"] for c in s2["courses"]] == ["INF4201"]


def test_semester_without_grades_returns_empty_list(client, db, courses):
    add_grade(db, courses["INF4101"], cc=10, tp=10, sn=10)
    response = client.get(URL, params={"semester": "S3"}, headers=auth())
    assert response.status_code == 200
    assert response.json() == {"matricule": MATRICULE, "semester": "S3", "courses": []}


@pytest.mark.parametrize("semester", ["S0", "S10", "s1", "1", "X1", ""])
def test_invalid_semester(client, semester):
    response = client.get(URL, params={"semester": semester}, headers=auth())
    assert response.status_code == 422


def test_student_never_sees_other_grades(client, db, courses):
    add_grade(db, courses["INF4101"], matricule=MATRICULE, cc=10, tp=10, sn=10)
    add_grade(db, courses["INF4102"], matricule="20u0001", cc=18, tp=18, sn=18)
    mine = client.get(URL, headers=auth(MATRICULE)).json()
    other = client.get(URL, headers=auth("20u0001")).json()
    stranger = client.get(URL, headers=auth("20u9999")).json()
    assert [c["code"] for c in mine["courses"]] == ["INF4101"]
    assert [c["code"] for c in other["courses"]] == ["INF4102"]
    assert stranger["courses"] == []
