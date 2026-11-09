from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, RedirectResponse

class MFAMiddleware(BaseHTTPMiddleware):
    """
    Middleware de control de acceso para forzar autenticación Multi-Factor (MFA/2FA) 
    y cambio obligatorio de contraseña.
    
    Este middleware actúa como un interceptor en el ciclo de vida de la petición. Su propósito 
    es verificar si el usuario tiene una sesión válida pero incompleta debido a requerimientos de 
    seguridad pendientes (como cambiar su contraseña inicial o verificar el código 2FA).
    
    Flujo de ejecución:
    1. Verifica si la ruta solicitada está excluida del control de seguridad (pág. de login, assets públicos).
    2. Intenta extraer el token JWT desde la cabecera 'Authorization' o desde las cookies.
    3. Si el token es válido, inspecciona las banderas `mfa_verified` y `must_change_password`.
    4. Si `mfa_verified` es falso, abre una sesión efímera en la base de datos para confirmar si el 2FA está activado.
    5. Si hay pendientes, redirige (HTMLResponse) o retorna error 403 con instrucciones de redirección (JSONResponse).
    
    Consideraciones de desarrollo:
    - Las exclusiones deben mantenerse actualizadas para evitar bucles de redirección infinita.
    - Se debe utilizar un gestor de contexto asíncrono `AsyncSessionLocal` para evitar fugas de conexiones a la base de datos.
    """
    async def dispatch(self, request: Request, call_next):
        """
        Intercepta y procesa la petición HTTP entrante.
        
        Args:
            request (Request): Objeto de petición de FastAPI/Starlette.
            call_next (Callable): Siguiente middleware o endpoint en la cadena de ejecución.
            
        Returns:
            Response: Una redirección, respuesta de error JSON, o la respuesta procesada por el endpoint.
        """
        path = request.url.path
        
        # Rutas de coincidencia exacta que no requieren JWT o control de MFA
        exact_exclusions = {
            "/",
            "/favicon.ico",
            "/flujopago/gestion-pagos/v1",
            "/flujopago/gestion-pagos/v1/",
        }
        
        if path in exact_exclusions:
            return await call_next(request)
            
        # Excluir rutas por prefijo que no requieren control de MFA/Force-Change
        # Importante: /flujopago/gestion-pagos/v1/dashboard NO se excluye aquí, para poder interceptarlo y redirigir
        excluded_prefixes = [
            "/flujopago/gestion-pagos/v1/login",
            # AUDITORÍA H-28: cerrar sesión con 2FA/cambio de clave pendiente respondía 403 y no borraba la cookie.
            "/flujopago/gestion-pagos/v1/logout",
            "/flujopago/gestion-pagos/v1/mfa/",
            "/flujopago/gestion-pagos/v1/password/force-change",
            "/docs",
            "/openapi.json",
            "/public",
            "/flujopago/gestion-pagos/v1/mfa-verify",
            "/flujopago/gestion-pagos/v1/force-change",
            # Shell estático de la SPA React (sin datos). La API sigue protegida por este middleware.
            "/flujopago/gestion-pagos/v1/app",
        ]
        
        for prefix in excluded_prefixes:
            if path.startswith(prefix):
                return await call_next(request)
        
        # Validar token
        token = request.headers.get("Authorization")
        if token and token.startswith("Bearer "):
            token = token.split(" ")[1]
        else:
            token = request.cookies.get("access_token")
            
        if not token:
            # Sin token, pasamos y dejamos que `auth_token_roles` maneje el 401.
            return await call_next(request)
            
        try:
            from app.infrastructure.security.jwt_handler import verify_token
            payload = verify_token(token)
            user_id = payload.get("sub")
            if not user_id:
                return await call_next(request)
            
            # Verificar claim mfa_verified en el payload
            mfa_verified = payload.get("mfa_verified", False)
            
            if not mfa_verified:
                # Consultar BD si tiene el MFA activado
                from app.infrastructure.db.database import AsyncSessionLocal
                from app.domain.models.tabla_usuarios import Usuarios
                async with AsyncSessionLocal() as session:
                    usuario = await session.get(Usuarios, int(user_id))
                    if usuario:
                        import os
                        super_admin_email = os.getenv("SEED_SUPER_ADMIN_EMAIL", "super_admin@flujopago.cl")
                        is_super_admin = (usuario.email == super_admin_email)

                        if usuario.must_change_password and not is_super_admin:
                            if path == "/flujopago/gestion-pagos/v1/dashboard":
                                return RedirectResponse(url="/flujopago/gestion-pagos/v1/force-change")
                            return JSONResponse(
                                status_code=403,
                                content={
                                    "status": "error",
                                    "code": 403,
                                    "message": "Debe cambiar su contraseña inicial.",
                                    "redirect_to": "/flujopago/gestion-pagos/v1/password/force-change"
                                }
                            )
                            
                        # Si no debe cambiar pass, obligamos a validar/configurar 2FA siempre
                        if path == "/flujopago/gestion-pagos/v1/dashboard":
                            return RedirectResponse(url="/flujopago/gestion-pagos/v1/mfa-verify")
                        return JSONResponse(
                            status_code=403,
                            content={
                                "status": "error",
                                "code": 403,
                                "message": "Validación o Configuración 2FA requerida.",
                                "redirect_to": "/flujopago/gestion-pagos/v1/mfa/verify"
                            }
                        )


        except Exception:
            # Token expirado o invalido, dejamos que la dependencia estandar dispare el HTTP 401
            pass
            
        return await call_next(request)
