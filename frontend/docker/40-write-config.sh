#!/bin/sh
# Rewrite config.json at every start from the environment, so the same image works
# with any architecture (same origin, or an API on another domain) without a rebuild.
set -eu

AUTH_API_URL="${AUTH_API_URL:-/api/auth}"
GRADES_API_URL="${GRADES_API_URL:-/api/grades}"

# Escape backslashes and double quotes so that the output is always valid JSON
json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

printf '{ "authApiUrl": "%s", "gradesApiUrl": "%s" }\n' \
  "$(json_escape "$AUTH_API_URL")" "$(json_escape "$GRADES_API_URL")" \
  > /usr/share/nginx/html/config.json

echo "40-write-config.sh: config.json written (auth=$AUTH_API_URL, grades=$GRADES_API_URL)"
