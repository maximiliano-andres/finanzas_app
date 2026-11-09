"""
Middleware centralizado para el manejo de errores HTTP y excepciones.
Renderiza templates HTML personalizados para cada tipo de error.
"""
from fastapi import Request
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.templating import Jinja2Templates
from pathlib import Path
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.middleware.error_handler import ErrorHandler
from app.infrastructure.utils.response_wrapper import error_response


logger = setup_logger("ERROR_MIDDLEWARE")

# Configurar templates
BASE_DIR = Path(__file__).parent.parent.parent
TEMPLATES_DIR = BASE_DIR / "interfaces" / "api" / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


class ErrorMiddleware(BaseHTTPMiddleware):
    """
    Middleware global para la gestión centralizada de excepciones y errores HTTP.
    
    Este middleware envuelve el ciclo completo de la petición-respuesta para capturar cualquier 
    excepción no controlada (errores 500), errores de validación de esquemas Pydantic (422) 
    y excepciones HTTP estándar (401, 404, etc.).
    
    Funciones clave:
    1. Redirección automática a login con bandera de expiración (`session_expired`) en respuestas 401 para vistas HTML.
    2. Enmascaramiento de errores internos: En las rutas identificadas como API, intercepta excepciones genéricas 
       y las reemplaza con un mensaje seguro obtenido de `ErrorHandler.get_safe_error_message(status_code)`. 
       Esto evita revelar detalles del motor de base de datos o trazas internas al cliente (mitigación de fugas de información).
    3. Renderizado automático de plantillas HTML personalizadas (ej. `error_404.html`) para navegadores webs.
    4. Detección dinámica e inteligente del tipo de cliente (API cliente vs. Navegador) según cabeceras HTTP `Accept` 
       y prefijos de rutas.
       
    Riesgos de modificación:
    - Cualquier excepción lanzada dentro de este middleware que no sea capturada provocará una caída del servidor web.
    - Alterar la lógica de detección `_is_api_route` puede causar que los endpoints de la API retornen HTML en lugar 
      de JSON, rompiendo la comunicación con clientes asíncronos (React/Fetch).
    """
    async def dispatch(self, request: Request, call_next):
        """
        Envuelve y procesa la petición HTTP controlando cualquier excepción que ocurra durante la cadena.
        
        Args:
            request (Request): Objeto de la petición.
            call_next (Callable): Siguiente elemento de la cadena.
            
        Returns:
            Response: Redirección, plantilla HTML o JSONResponse de error enmascarado.
        """
        try:
            
            response = await call_next(request)

            # Interceptar respuestas 401 (token inexistente o expirado)
            if response.status_code == 401 and not self._is_api_route(request):
                logger.info(
                    f"401 detectado en {request.url.path}. Redirigiendo a login con aviso de expiración."
                )
                return RedirectResponse(url="/flujopago/gestion-pagos/v1/?error=session_expired", status_code=302)

            # Interceptar respuesta 404 para rutas que no son API para devolver HTML
            if response.status_code == 404 and not self._is_api_route(request):
                logger.warning(f"404 detectado en {request.url.path}. Renderizando template HTML.")
                return self._render_error_template(request, 404)

            return response


        except StarletteHTTPException as e:
            logger.warning(f"Error HTTP {e.status_code}: {e.detail}")

            if e.status_code == 401 and not self._is_api_route(request):
                logger.info("401 por excepción → redirect a login con aviso de expiración")
                return RedirectResponse(url="/flujopago/gestion-pagos/v1/?error=session_expired", status_code=302)

            if self._is_api_route(request):
                return JSONResponse(
                    status_code=e.status_code,
                    content=error_response(message=e.detail, request=request, status_code=e.status_code)
                )

            return self._render_error_template(request, e.status_code)
            
            
        except RequestValidationError as e:
            logger.error(f"Error de validación: {str(e)}")
            if self._is_api_route(request):
                return JSONResponse(
                    status_code=422,
                    content=error_response(message="Error de validación en los datos", errors=e.errors(), request=request, status_code=422)
                )
            return self._render_error_template(request, 422)

        except Exception as e:
            status_code = ErrorHandler.detect_error_code_from_exception(e)
            logger.error(f"Excepción capturada ({status_code}): {type(e).__name__} - {str(e)}")
            
            if self._is_api_route(request):
                # No exponer str(e) al cliente en la API para evitar fugas de información interna
                safe_message = ErrorHandler.get_safe_error_message(status_code)
                return JSONResponse(
                    status_code=status_code,
                    content=error_response(message=safe_message, request=request, status_code=status_code)
                )
            return self._render_error_template(request, status_code)

    
    def _is_api_route(self, request: Request) -> bool:
        # Si la cabecera Accept contiene text/html, el cliente espera HTML (navegador)
        # Esto es crucial para páginas no encontradas (404) escritas al azar en el navegador
        accept = request.headers.get("accept", "")
        if "text/html" in accept:
            return False

        path = request.url.path
        if path.startswith("/api"):
            return True
        if path.startswith("/flujopago/gestion-pagos/v1"):
            # Si el método es POST, PUT, DELETE, PATCH, siempre es API
            if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
                return True
            # Excluir páginas HTML conocidas
            for html_path in ["/", "/login", "/dashboard", "/force-change", "/mfa-verify"]:
                if path == f"/flujopago/gestion-pagos/v1{html_path}" or path == f"/flujopago/gestion-pagos/v1{html_path}/":
                    return False
            # Excluir rutas de descarga de archivos (PDFs)
            for file_path in ["/doc_pdf/", "/PDF_firmados/", "/PDF_autorizaciones/"]:
                if path.startswith(f"/flujopago/gestion-pagos/v1{file_path}"):
                    return False
            return True
        return False

    def _handle_http_error(self, request: Request, status_code: int) -> HTMLResponse:
        logger.warning(f"Error HTTP {status_code} en {request.url.path}")
        return self._render_error_template(request, status_code)
    
    def _render_error_template(self, request: Request, status_code: int) -> HTMLResponse:
        template = ErrorHandler.get_template_for_status(status_code)
        
        try:
            return templates.TemplateResponse(
                template,
                {
                    "request": request,
                    "status_code": status_code,
                    "error_config": ErrorHandler.get_error_config(status_code)
                },
                status_code=status_code
            )
        except Exception as e:
            # Fallback si el template no existe
            logger.error(f"Error al renderizar template {template}: {str(e)}")
            return templates.TemplateResponse(
                "error_500.html",
                {"request": request, "status_code": 500},
                status_code=500
            )
