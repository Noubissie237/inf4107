.PHONY: up down seed venv test smoke

# Python used for tests and the smoke test: the local .venv if it exists (make venv),
# otherwise python3. Override with: make test PYTHON=/path/to/python
PYTHON ?= $(if $(wildcard $(CURDIR)/.venv/bin/python),$(CURDIR)/.venv/bin/python,python3)

up:
	docker compose up -d --build

down:
	docker compose down

seed:
	docker compose --profile tools build seed
	docker compose --profile tools run --rm seed --students 2000 --my-matricule 20u2671

venv:
	python3 -m venv .venv
	.venv/bin/pip install -r auth-service/requirements-dev.txt \
		-r grades-service/requirements-dev.txt -r scripts/requirements.txt

test:
	cd auth-service && $(PYTHON) -m pytest
	cd grades-service && $(PYTHON) -m pytest

smoke:
	set -a; . ./.env; set +a; $(PYTHON) scripts/smoke_test.py
