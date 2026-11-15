"""End-to-end test through the gateway.

Usage: python scripts/smoke_test.py [URL] [MATRICULE]
The password comes from --password or SEED_PASSWORD.
"""

import argparse
import os
import struct
import sys
import zlib

import httpx


def tiny_png(size: int = 64) -> bytes:
    """A valid red PNG built by hand, so the script only needs httpx."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    row = b"\x00" + b"\xff\x00\x00" * size
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(row * size))
        + chunk(b"IEND", b"")
    )


class Smoke:
    def __init__(self, base_url: str):
        self.client = httpx.Client(base_url=base_url, timeout=15)
        self.failures = 0

    def step(self, name: str, func) -> bool:
        try:
            detail = func()
        except (AssertionError, httpx.HTTPError, KeyError, ValueError) as exc:
            self.failures += 1
            print(f"[ÉCHEC] {name} : {exc or type(exc).__name__}")
            return False
        print(f"[OK]    {name}" + (f" ({detail})" if detail else ""))
        return True


def expect(response: httpx.Response, status: int) -> httpx.Response:
    assert response.status_code == status, f"HTTP {response.status_code}, attendu {status}"
    return response


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", nargs="?", default="http://localhost:8080")
    parser.add_argument("matricule", nargs="?", default="20u2671")
    parser.add_argument("--password", default=os.environ.get("SEED_PASSWORD"))
    args = parser.parse_args()
    if not args.password:
        sys.exit("Mot de passe manquant : utilisez --password ou SEED_PASSWORD")

    smoke = Smoke(args.url.rstrip("/"))
    client = smoke.client
    state: dict = {}
    photo = tiny_png()

    def health(service):
        def check():
            body = expect(client.get(f"/api/{service}/health"), 200).json()
            assert body["status"] == "ok", body
            return f"instance={body['instance']}"

        return check

    def login():
        response = expect(
            client.post(
                "/api/auth/login", json={"matricule": args.matricule, "password": args.password}
            ),
            200,
        )
        state["headers"] = {"Authorization": f"Bearer {response.json()['access_token']}"}

    def me():
        body = expect(client.get("/api/auth/me", headers=state["headers"]), 200).json()
        assert body["matricule"] == args.matricule.lower(), body
        return body["full_name"]

    def grades():
        body = expect(
            client.get(
                "/api/grades/me/grades", params={"semester": "S1"}, headers=state["headers"]
            ),
            200,
        ).json()
        assert body["courses"], "aucune matière (le seed a-t-il été lancé ?)"
        return f"{len(body['courses'])} matières"

    def upload():
        response = client.put(
            "/api/auth/me/photo",
            headers=state["headers"],
            files={"file": ("photo.png", photo, "image/png")},
        )
        assert expect(response, 200).json()["photo_url"], "photo_url vide"

    def read_back():
        response = client.get("/api/auth/me/photo", headers=state["headers"])
        if response.status_code == 307:
            # S3 mode: redirect to a signed URL (its host may not resolve from here)
            assert response.headers.get("location"), "redirection sans en-tête Location"
            return "redirection vers l'URL signée"
        expect(response, 200)
        assert response.headers["content-type"] == "image/png", response.headers["content-type"]
        assert response.content == photo, "la photo relue diffère de l'originale"

    smoke.step("health auth-service", health("auth"))
    smoke.step("health grades-service", health("grades"))
    if smoke.step("login", login):
        smoke.step("profil (/me)", me)
        smoke.step("notes du semestre S1", grades)
        if smoke.step("envoi de la photo", upload):
            smoke.step("relecture de la photo", read_back)
    else:
        print("[IGNORÉ] étapes suivantes : pas de jeton")

    print("\nRésultat :", "SUCCÈS" if smoke.failures == 0 else f"{smoke.failures} échec(s)")
    return 1 if smoke.failures else 0


if __name__ == "__main__":
    sys.exit(main())
