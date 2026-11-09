#!/usr/bin/env bash
# Regenera docs/screenshots con datos de demostración (empresas y personas ficticias).
# Levanta PostgreSQL, Redis y el backend en contenedores efímeros (no toca la BD de desarrollo),
# siembra los datos de demo y captura con Playwright (frontend/node_modules).
#   Requisitos: Docker, Node, `cd frontend && npm ci && npx playwright install chromium && npm run build`
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NET=flujopago-shots-net
DB=flujopago-shots-db
REDIS=flujopago-shots-redis
APPC=flujopago-shots-app
PORT="${PORT:-8077}"
IMAGE="${BASE_IMAGE:-flujopago-e2e-app:latest}"
DBURL="postgresql+asyncpg://shots:shots_pass@$DB:5432/flujopago_shots"
SECRET="screenshots-only-secret-key-0123456789abcdef"

cleanup() { docker rm -f "$APPC" "$DB" "$REDIS" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

[ -f "$ROOT/frontend/dist/index.html" ] || { echo "Falta frontend/dist: ejecute 'cd frontend && npm run build'"; exit 1; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -t "$IMAGE" "$ROOT"
docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=shots -e POSTGRES_PASSWORD=shots_pass -e POSTGRES_DB=flujopago_shots postgres:16-alpine >/dev/null
docker run -d --name "$REDIS" --network "$NET" redis:7-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$DB" pg_isready -U shots -d flujopago_shots >/dev/null 2>&1 && break; sleep 1; done

ENVS=(-e DATABASE_URL="$DBURL" -e REDIS_URL="redis://$REDIS:6379/0" -e SECRET_KEY="$SECRET"
      -e FERNET_KEY="vd_Hi0om8BdCLGZPWSfyXO9uWIj4yRCDzj2CLB4BqNw=" -e SEED_SUPER_ADMIN_EMAIL="super_admin@flujopago.cl"
      -e SEED_SUPER_ADMIN_PASSWORD="Demo_Super2026!" -e SMTP_HOST=127.0.0.1 -e SMTP_PORT=1 -e APP_ENV=demo)

docker run -d --name "$APPC" --network "$NET" -p "$PORT:8000" -v "$ROOT":/code -w /code "${ENVS[@]}" "$IMAGE" \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 >/dev/null
for _ in $(seq 1 60); do curl -fs "http://localhost:$PORT/flujopago/gestion-pagos/v1/app/login" >/dev/null 2>&1 && break; sleep 1; done

TOKEN="$(docker exec "${ENVS[@]}" "$APPC" python scripts/screenshots/seed_demo.py | tail -1)"
cd "$ROOT/frontend"
FLUJOPAGO_SHOTS_BASE="http://localhost:$PORT" FLUJOPAGO_SHOTS_TOKEN="$TOKEN" node scripts/capturar-screenshots.mjs
