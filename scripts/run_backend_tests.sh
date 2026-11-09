#!/usr/bin/env bash
# Ejecuta TODA la suite backend de forma reproducible y aislada:
#   1) Pruebas unitarias existentes (app/tests, BD mockeada).
#   2) Pruebas de integración reales (tests/integration) contra PostgreSQL y Redis EFÍMEROS.
#
# No toca la BD ni el Redis de desarrollo/producción: levanta contenedores propios (tmpfs)
# en la red docker "flujopago-test-net". Uso:
#   scripts/run_backend_tests.sh            # todo
#   scripts/run_backend_tests.sh unit       # solo unitarias
#   scripts/run_backend_tests.sh integration [args de pytest...]
#   KEEP_CONTAINERS=1 scripts/run_backend_tests.sh   # no destruye Postgres/Redis al final
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NET=flujopago-test-net
DB=flujopago-test-db
REDIS=flujopago-test-redis
BASE_IMAGE="${BASE_IMAGE:-flujopago-e2e-app:latest}"   # imagen de la app (Dockerfile del repo)
TEST_IMAGE=flujopago-backend-test
MODE="${1:-all}"; shift || true

if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  echo "Construyendo imagen base $BASE_IMAGE desde el Dockerfile del repo..."
  docker build -t "$BASE_IMAGE" "$ROOT"
fi
docker build -q -t "$TEST_IMAGE" - >/dev/null <<EOF
FROM $BASE_IMAGE
USER root
RUN pip install -q -r /dev/stdin <<'REQ'
pytest==8.3.3
pytest-asyncio==0.23.8
REQ
USER appuser
EOF

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
# Contenedores detenidos (p.ej. tras reiniciar Docker) se recrean: sus datos están en tmpfs.
for c in "$DB" "$REDIS"; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = "false" ]; then docker rm -f "$c" >/dev/null; fi
done
if ! docker container inspect "$DB" >/dev/null 2>&1; then
  docker run -d --name "$DB" --network "$NET" --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_USER=flujopago_test -e POSTGRES_PASSWORD=flujopago_test_pass -e POSTGRES_DB=flujopago_test postgres:16-alpine >/dev/null
fi
if ! docker container inspect "$REDIS" >/dev/null 2>&1; then
  docker run -d --name "$REDIS" --network "$NET" redis:7-alpine redis-server --requirepass redis_test_pass >/dev/null
fi
for _ in $(seq 1 30); do docker exec "$DB" pg_isready -U flujopago_test -d flujopago_test >/dev/null 2>&1 && break; sleep 1; done

cleanup() {
  if [ -z "${KEEP_CONTAINERS:-}" ]; then docker rm -f "$DB" "$REDIS" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

run() {
  docker run --rm --network "$NET" -v "$ROOT":/code -w /code \
    -e TEST_DATABASE_URL="postgresql+asyncpg://flujopago_test:flujopago_test_pass@$DB:5432/flujopago_test" \
    -e TEST_REDIS_URL="redis://:redis_test_pass@$REDIS:6379/0" \
    "$TEST_IMAGE" python -m pytest -p no:cacheprovider "$@"
}

status=0
if [ "$MODE" = "all" ] || [ "$MODE" = "unit" ]; then
  echo "== Pruebas unitarias (app/tests) =="
  run app/tests -q "$@" || status=$?
fi
if [ "$MODE" = "all" ] || [ "$MODE" = "integration" ]; then
  echo "== Pruebas de integración reales (tests/integration) =="
  run tests/integration -q -rxX "$@" || status=$?
fi
exit $status
