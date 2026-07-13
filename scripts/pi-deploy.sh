#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  cat <<'MSG'
Created backend/.env from backend/.env.example.
Edit backend/.env on the Raspberry Pi and fill DB_PASSWORD and SESSION_SECRET, then rerun this script.
MSG
  exit 1
fi

if ! grep -q '^DB_HOST=127\.0\.0\.1$' backend/.env; then
  echo "backend/.env must use DB_HOST=127.0.0.1 because the backend and MariaDB run on the Raspberry Pi." >&2
  exit 1
fi

if ! grep -q '^DB_USER=namulite_app$' backend/.env; then
  echo "backend/.env must use DB_USER=namulite_app." >&2
  exit 1
fi

if grep -q '^DB_PASSWORD=$' backend/.env; then
  echo "backend/.env DB_PASSWORD is empty. Fill it on the Raspberry Pi; do not commit it." >&2
  exit 1
fi

if grep -q '^SESSION_SECRET=$' backend/.env; then
  echo "backend/.env SESSION_SECRET is empty. Set a random value of at least 32 characters." >&2
  exit 1
fi

npm install
npm run db:migrate
npm run db:verify
npm run build
