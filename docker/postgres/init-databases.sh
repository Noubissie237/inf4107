#!/bin/sh
# Create one database per microservice (runs once, on first start of the volume).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    CREATE DATABASE auth_db;
    CREATE DATABASE grades_db;
EOSQL
