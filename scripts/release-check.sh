#!/bin/sh

set -eu

if [ -n "${1-}" ]; then
  BASE_URL="$1"
else
  BASE_URL="${BASE_URL:-}"
fi

echo "Running static checks"
npm run check
npm run build

if [ -n "$BASE_URL" ]; then
  echo "Checking deployed health endpoint: $BASE_URL/health"
  curl --fail --silent --show-error "$BASE_URL/health" >/dev/null
fi

echo "Release checks completed"