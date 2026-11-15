"""Teacher tool: check every student's deployment.

Usage: python teacher/check_instances.py matricules.txt [--domain inf4107.site]

The file holds one matricule per line (blank lines and lines starting with # are ignored).
For each <matricule>.<domain> it checks: DNS resolution, HTTPS certificate, home page,
and /api/auth/health and /api/grades/health (with `instance` equal to the matricule).
Prints a table and exits with a non-zero code if any instance fails.
"""

import argparse
import re
import socket
import ssl
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

MATRICULE_RE = re.compile(r"^\d{2}u\d{4}$")
CHECKS = ["DNS", "HTTPS", "ACCUEIL", "AUTH", "GRADES"]


def check_dns(host: str, matricule: str, client: httpx.Client, timeout: float) -> str:
    socket.getaddrinfo(host, 443)
    return "résolu"


def check_certificate(host: str, matricule: str, client: httpx.Client, timeout: float) -> str:
    # The handshake verifies the chain, the expiry date and the host name
    with socket.create_connection((host, 443), timeout=timeout) as sock:
        with ssl.create_default_context().wrap_socket(sock, server_hostname=host) as tls:
            cert = tls.getpeercert()
    days = (ssl.cert_time_to_seconds(cert["notAfter"]) - time.time()) / 86400
    return f"expire dans {days:.0f} j"


def check_home(host: str, matricule: str, client: httpx.Client, timeout: float) -> str:
    response = client.get(f"https://{host}/")
    assert response.status_code == 200, f"HTTP {response.status_code}"
    return "HTTP 200"


def health_check(path: str, service: str):
    def check(host: str, matricule: str, client: httpx.Client, timeout: float) -> str:
        response = client.get(f"https://{host}{path}")
        assert response.status_code == 200, f"HTTP {response.status_code}"
        body = response.json()
        assert body.get("status") == "ok", f"status={body.get('status')!r}"
        assert body.get("service") == service, f"service={body.get('service')!r}"
        assert body.get("instance") == matricule, f"instance={body.get('instance')!r}"
        return "ok"

    return check


STEPS = [
    ("DNS", check_dns),
    ("HTTPS", check_certificate),
    ("ACCUEIL", check_home),
    ("AUTH", health_check("/api/auth/health", "auth-service")),
    ("GRADES", health_check("/api/grades/health", "grades-service")),
]


def check_instance(matricule: str, domain: str, timeout: float) -> dict[str, str | None]:
    """Return {check name: None if OK, else the error message}. Stops at the first DNS failure."""
    host = f"{matricule}.{domain}"
    results: dict[str, str | None] = {}
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        for name, func in STEPS:
            try:
                func(host, matricule, client, timeout)
                results[name] = None
            except Exception as exc:  # any network, TLS or assertion error is a failure
                results[name] = str(exc) or type(exc).__name__
                if name == "DNS":
                    break
    return results


def read_matricules(path: str) -> list[str]:
    matricules, invalid = [], []
    with open(path, encoding="utf-8") as file:
        for line in file:
            value = line.split("#")[0].strip().lower()
            if not value:
                continue
            (matricules if MATRICULE_RE.match(value) else invalid).append(value)
    if invalid:
        sys.exit(f"Matricules invalides dans {path} : {', '.join(invalid)}")
    return list(dict.fromkeys(matricules))  # without duplicates, same order


def print_table(results: dict[str, dict[str, str | None]]) -> None:
    print(f"{'MATRICULE':<10} " + " ".join(f"{name:<8}" for name in CHECKS) + " RÉSULTAT")
    for matricule, checks in results.items():
        cells = []
        for name in CHECKS:
            cells.append("-" if name not in checks else "OK" if checks[name] is None else "ÉCHEC")
        status = (
            "OK"
            if all(v is None for v in checks.values()) and len(checks) == len(CHECKS)
            else "ÉCHEC"
        )
        print(f"{matricule:<10} " + " ".join(f"{cell:<8}" for cell in cells) + f" {status}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="text file with one matricule per line")
    parser.add_argument("--domain", default="inf4107.site")
    parser.add_argument("--timeout", type=float, default=10)
    parser.add_argument("--workers", type=int, default=10)
    args = parser.parse_args()

    matricules = read_matricules(args.file)
    if not matricules:
        sys.exit("Aucun matricule dans le fichier")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        outcomes = pool.map(lambda m: check_instance(m, args.domain, args.timeout), matricules)
        results = dict(zip(matricules, outcomes, strict=True))

    print_table(results)
    failed = {m: c for m, c in results.items() if any(v is not None for v in c.values())}
    for matricule, checks in failed.items():
        for name, error in checks.items():
            if error is not None:
                print(f"  {matricule} {name} : {error}")
    print(f"\n{len(results) - len(failed)}/{len(results)} instance(s) OK")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
