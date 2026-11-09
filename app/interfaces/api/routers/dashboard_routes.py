from fastapi import APIRouter, Request, Depends, Response, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.utils.response_wrapper import success_response, error_response
from app.infrastructure.db.database import get_db

from app.domain.models.tabla_procesos import Procesos
from app.domain.models.tabla_roles import Roles
from app.domain.models.tabla_usuarios import Usuarios
from app.domain.models.tabla_procesos_auxiliares import ProcesosAuxiliares

from app.domain.dto.procesosDTO import ProcesosOut, ProcesosIn
from app.domain.dto.empresasDTO import EmpresasOut, EmpresasIn
from app.domain.dto.rolesDTO import RolesOut, RolesIn
from app.domain.dto.usuariosDTO import UsuariosOut, UsuariosIn
from app.domain.dto.procesos_auxiliaresDTO import (
    ProcesosAuxiliaresOut,
    ProcesosAuxiliaresIn,
)
from app.domain.dto.LoginDTO import LoginIn

from app.domain.services.usuario_service import crear_usuario_service
from app.domain.services.procesos_service import crear_proceso_service
from app.domain.services.proceso_auxiliares_service import (
    crear_proceso_auxiliar_service,
)
from app.domain.services.empresa_service import crear_empresa_service


from app.infrastructure.security.auth import login_service
from app.infrastructure.security.jwt_handler import verify_token
from app.infrastructure.security.auth_token_roles import get_current_user, require_admin
from app.infrastructure.security.jwt_handler import ACCESS_TOKEN_EXPIRE
from app.interfaces.api.routers.spa_routes import spa_redirect
from app.infrastructure.security.redis_service import (
    is_login_locked,
    increment_login_attempts,
    clear_login_attempts
)


logger = setup_logger("DASHBOARD ROUTES")


# Crear el router
router = APIRouter(prefix="/flujopago/gestion-pagos/v1")


# INICIO DE SESION
@router.post("/login", tags=["Auth", "Login"])
async def login(
    request: Request,
    response: Response,
    data: LoginIn,
    session: AsyncSession = Depends(get_db),
):

    try:
        if data.email is None or data.password is None:
            raise HTTPException(
                status_code=400, detail="Email y contraseña son obligatorios"
            )

        client_ip = request.client.host if request.client else "unknown"

        # Verificar bloqueo por intentos fallidos
        if data.email:
            if await is_login_locked(data.email, client_ip):
                response.status_code = 429
                return error_response(
                    "Demasiados intentos fallidos. Intente nuevamente en 15 minutos.",
                    request=request,
                    status_code=429
                )

        logger.info(f"Login iniciado por usuario: {data.email}")
        tokens = await login_service(data.email, data.password, session, remember_device=data.remember_device)

        # Limpiar intentos fallidos si es exitoso
        if data.email:
            await clear_login_attempts(data.email, client_ip)

        token_decodificado = verify_token(tokens["access_token"])
        # [DEBUG] Tokens y payload decodificado (contiene secretos/datos sensibles)
        # logger.debug(f"Tokens generados: {tokens}")
        # logger.debug(f"Token decodificado: {token_decodificado}")

        # Verificar si la cookie de dispositivo de confianza es válida
        trusted_device_jwt = request.cookies.get("trusted_device")
        mfa_verified = False
        if trusted_device_jwt:
            try:
                import jwt
                from app.infrastructure.security.jwt_handler import SECRET_KEY, ALGORITHM
                from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
                from datetime import datetime

                cookie_payload = jwt.decode(trusted_device_jwt, SECRET_KEY, algorithms=[ALGORITHM])
                cookie_user_id = int(cookie_payload.get("sub"))
                device_uuid = cookie_payload.get("jti")

                if cookie_user_id == int(token_decodificado["sub"]):
                    result = await session.execute(
                        select(DispositivosConfianza).where(
                            DispositivosConfianza.device_token == device_uuid,
                            DispositivosConfianza.usuario_id == cookie_user_id
                        )
                    )
                    db_device = result.scalar_one_or_none()
                    if db_device and db_device.expires_at > datetime.utcnow():
                        mfa_verified = True
                        db_device.last_used_at = datetime.utcnow()
                        await session.commit()
                        logger.info(f"Bypass de 2FA exitoso para usuario {data.email} en dispositivo confiado: {db_device.device_name}")
            except Exception as e:
                logger.warning(f"No se pudo verificar el dispositivo de confianza: {e}")

        if mfa_verified:
            # Re-generar token con claim mfa_verified = True
            from app.infrastructure.security.jwt_handler import create_token
            payload = token_decodificado.copy()
            payload.pop("exp", None)
            payload["mfa_verified"] = True
            tokens["access_token"] = create_token(payload, ACCESS_TOKEN_EXPIRE)
            
            # Recargar token_decodificado para el log
            token_decodificado = verify_token(tokens["access_token"])
            logger.info("Token actualizado con bypass 2FA.")

        # Configurar la cookie con el access_token

        response.set_cookie(
            key="access_token",
            value=tokens["access_token"],
            httponly=True,  # No accesible desde JavaScript (seguridad contra XSS)
            secure=request.url.scheme == "https",  # True en HTTPS
            samesite="lax",  # Protección contra CSRF
            max_age=ACCESS_TOKEN_EXPIRE,  # Duración igual al token JWT
        )

        return success_response(data=tokens, message="Login exitoso", request=request)

    except HTTPException as http_exc:
        client_ip = request.client.host if request.client else "unknown"
        if data.email and http_exc.status_code in (401, 404):
            await increment_login_attempts(data.email, client_ip)

        response.status_code = http_exc.status_code
        if http_exc.status_code == 404:
            msg = "El email ingresado no está registrado en el sistema"
            logger.warning(f"Intento de login con email no registrado: {data.email}")
        elif http_exc.status_code == 401:
            msg = "Error de Credenciales: Email o contraseña incorrectos"
            logger.warning(
                f"Intento de login con contraseña incorrecta para: {data.email}"
            )
        else:
            msg = http_exc.detail
            logger.error(f"ERROR LOGIN HTTP: {msg}")

        return error_response(msg, request=request, status_code=http_exc.status_code)

    except Exception as e:
        client_ip = request.client.host if request.client else "unknown"
        if data.email:
            await increment_login_attempts(data.email, client_ip)
        response.status_code = 500
        logger.error(f"ERROR LOGIN INESPERADO: {type(e).__name__}: {e}")
        # AUDITORÍA H-27: antes se devolvía str(e) al cliente (credenciales/hosts de BD en el mensaje).
        return error_response("Error interno durante el login", request=request, status_code=500)


@router.post("/logout", tags=["Auth"])
async def logout(request: Request, response: Response, session: AsyncSession = Depends(get_db)):
    # NOTA: El dispositivo de confianza NO se elimina de la base de datos al hacer logout.
    # El dispositivo "confiar por 30 días" debe persistir entre sesiones. Solo se elimina si:
    # - Expira naturalmente (30 días)
    # - El usuario lo revoca manualmente desde el panel de Seguridad
    # Actualizamos last_used_at si el dispositivo existe (opcional, para trazabilidad)
    trusted_device_jwt = request.cookies.get("trusted_device")
    if trusted_device_jwt:
        try:
            import jwt
            from app.infrastructure.security.jwt_handler import SECRET_KEY, ALGORITHM
            from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
            from datetime import datetime

            cookie_payload = jwt.decode(trusted_device_jwt, SECRET_KEY, algorithms=[ALGORITHM])
            device_uuid = cookie_payload.get("jti")
            cookie_user_id = int(cookie_payload.get("sub"))

            result = await session.execute(
                select(DispositivosConfianza).where(
                    DispositivosConfianza.device_token == device_uuid,
                    DispositivosConfianza.usuario_id == cookie_user_id
                )
            )
            db_device = result.scalar_one_or_none()
            if db_device:
                db_device.last_used_at = datetime.utcnow()
                await session.commit()
                logger.info(f"Sesión cerrada. Dispositivo de confianza {db_device.device_name} conservado (expira: {db_device.expires_at}).")
        except Exception as e:
            logger.warning(f"No se pudo actualizar el dispositivo en logout: {e}")

    # Solo borrar la cookie de sesión (access_token)
    # La cookie trusted_device se mantiene intencionalmente para el bypass de 30 días
    # CORRECCIÓN (migración React): antes se llamaba delete_cookie sobre el `response` inyectado,
    # pero se retornaba OTRO objeto (TemplateResponse), por lo que FastAPI descartaba el Set-Cookie
    # y la cookie access_token NUNCA se eliminaba en el logout (bug preexistente).
    # El frontend React no usa el cuerpo de esta respuesta: se responde JSON estándar.
    logout_response = JSONResponse(
        content=success_response(data=None, message="Sesión cerrada", request=request)
    )
    logout_response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=request.url.scheme == "https",  # mismo atributo con que se emitió la cookie en /login
        samesite="lax",
    )
    return logout_response


# ============================================================================
# Rutas HTML heredadas: el frontend original (Jinja2 + JS) fue reemplazado por la SPA React
# (/flujopago/gestion-pagos/v1/app). Estas URLs se conservan para no romper enlaces, marcadores,
# correos ni las redirecciones de ErrorMiddleware/MFAMiddleware: todas redirigen a la SPA,
# que valida la sesión (GET /session) y resuelve el paso pendiente (cambio de contraseña / 2FA).
# ============================================================================

@router.get("/login", include_in_schema=False)
async def login_page(request: Request):
    return spa_redirect(request, "login")


@router.get("/", include_in_schema=False)
async def home(request: Request):
    # Preserva ?error=session_expired (lo agrega ErrorMiddleware ante un 401).
    return spa_redirect(request, "login")


@router.get("/dashboard", include_in_schema=False)
async def dashboard(request: Request, current_user: dict = Depends(get_current_user)):
    # Se conserva la dependencia: sin sesión, ErrorMiddleware redirige a /?error=session_expired
    # (contrato existente, cubierto por app/tests/test_auth_redirect.py).
    return spa_redirect(request, "")


@router.get("/force-change", include_in_schema=False)
async def force_change_page(request: Request):
    return spa_redirect(request, "force-change")


@router.get("/mfa-verify", include_in_schema=False)
async def mfa_verify_page(request: Request):
    return spa_redirect(request, "mfa")
