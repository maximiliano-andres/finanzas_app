# Entorno E2E aislado
Stack real (PostgreSQL + Redis + Mailpit + backend FastAPI) en puertos separados del desarrollo.

```bash
docker compose -p flujopago-e2e -f e2e/docker-compose.e2e.yml --env-file e2e/.env.e2e up -d --build
cd frontend && npm run build && npm run test:e2e
```
- Backend + SPA: http://localhost:8001/flujopago/gestion-pagos/v1/app/
- Mailpit (correos OTP/2FA capturados): http://localhost:58025
- La base de datos vive en tmpfs: cada `down`/`up` parte de un seed limpio.
