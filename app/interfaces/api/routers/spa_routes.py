"""
Rutas de soporte para el frontend React (SPA).

Cambios ADITIVOS al backend, introducidos por la migración a React:

1. GET  /flujopago/gestion-pagos/v1/session
   Devuelve los datos públicos del usuario autenticado (claims del JWT de la cookie httpOnly).
   Motivo: el frontend original guardaba el JWT en sessionStorage y lo decodificaba en el
   navegador para conocer el usuario/rol. React no almacena el token (solo cookie httpOnly),
   por lo que necesita este endpoint. Pasa por MFAMiddleware: si el 2FA o el cambio de
   contraseña están pendientes, responde 403 con `redirect_to`, igual que el resto de la API.

2. GET  /flujopago/gestion-pagos/v1/app/{path}
   Sirve el build de la SPA (frontend/dist). El shell HTML no contiene datos sensibles;
   toda la información se obtiene vía API, que mantiene sus controles de autenticación.

El frontend original (Jinja2 + JS vanilla) fue retirado: las URLs antiguas redirigen a la SPA
(ver dashboard_routes.py). Rollback: volver a un commit anterior a la migración.
"""
from pathlib import Path
from typing import Dict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

from app.infrastructure.security.auth_token_roles import get_current_user
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("SPA ROUTES")

API_PREFIX = "/flujopago/gestion-pagos/v1"
SPA_PREFIX = f"{API_PREFIX}/app"
SPA_DIST = Path(__file__).resolve().parents[4] / "frontend" / "dist"

# Claims que el frontend necesita. No se expone el token ni claims internos.
PUBLIC_CLAIMS = (
    "sub", "email", "primer_nombre", "segundo_nombre", "primer_apellido",
    "segundo_apellido", "rol_id", "rol_nombre", "rut", "cargo", "exp",
)

router = APIRouter(prefix=API_PREFIX)


def spa_redirect(request: Request, spa_path: str) -> RedirectResponse:
    """Redirige a la ruta equivalente de la SPA preservando la query string."""
    query = request.url.query
    url = f"{SPA_PREFIX}/{spa_path.lstrip('/')}"
    return RedirectResponse(url=f"{url}?{query}" if query else url, status_code=302)


@router.get("/session", tags=["Auth"])
async def current_session(current_user: Dict = Depends(get_current_user)):
    return {k: current_user.get(k) for k in PUBLIC_CLAIMS}


def _index_response() -> HTMLResponse:
    html = (SPA_DIST / "index.html").read_text(encoding="utf-8")
    # El shell nunca debe cachearse (los assets llevan hash y sí son cacheables).
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


@router.get("/app", include_in_schema=False)
@router.get("/app/{path:path}", include_in_schema=False)
async def serve_spa(path: str = ""):
    if not (SPA_DIST / "index.html").is_file():
        logger.error(f"No existe el build del frontend en {SPA_DIST}. Ejecute: cd frontend && npm ci && npm run build")
        return HTMLResponse(
            "<h1>Frontend no disponible</h1><p>El build del frontend React no existe en el servidor "
            "(frontend/dist). Ejecute <code>cd frontend &amp;&amp; npm ci &amp;&amp; npm run build</code>.</p>",
            status_code=503,
        )

    if path:
        candidate = (SPA_DIST / path).resolve()
        # Protección contra path traversal: el archivo debe estar dentro de dist/.
        if SPA_DIST.resolve() in candidate.parents and candidate.is_file():
            headers = {}
            if path.startswith("assets/"):
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return FileResponse(candidate, headers=headers)
        if path.startswith("assets/"):
            return HTMLResponse("Not Found", status_code=404)

    # Cualquier otra ruta es manejada por React Router.
    return _index_response()
