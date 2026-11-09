from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, JSONResponse
import json
from typing import Callable

from app.infrastructure.utils.response_wrapper import success_response
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("RESPONSE_MIDDLEWARE")


def _copy_cookies(original_response: Response, new_response: JSONResponse) -> None:
    """
    Copia los headers Set-Cookie del response original al nuevo JSONResponse.

    Cuando se hace response.set_cookie() en una ruta FastAPI y luego el middleware
    crea un nuevo JSONResponse, los Set-Cookie se pierden porque dict(response.headers)
    no los incluye correctamente (son multi-value headers). Este helper los copia
    directamente desde raw_headers para preservarlos.
    """
    for header_name, header_value in original_response.raw_headers:
        # raw_headers son bytes en Starlette
        name = header_name.decode("latin-1") if isinstance(header_name, bytes) else header_name
        if name.lower() == "set-cookie":
            value = header_value.decode("latin-1") if isinstance(header_value, bytes) else header_value
            new_response.headers.append("set-cookie", value)


class ResponseWrapperMiddleware(BaseHTTPMiddleware):
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:

        # Excluir rutas de documentación de OpenAPI del wrapper
        if request.url.path in ["/openapi.json", "/docs", "/redoc"]:
             return await call_next(request)

        # Procesar la solicitud
        response = await call_next(request)
        
        # Solo envolver respuestas JSON (no HTML ni otros tipos)
        content_type = response.headers.get("content-type", "")
        
        # Si no es JSON, retornar sin modificar
        if "application/json" not in content_type:
            return response
        
        try:
            # Leer el body de la respuesta
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            
            # Intentar parsear como JSON
            if body:
                data = json.loads(body.decode())
                
                # Verificar si ya tiene el formato wrapper
                if isinstance(data, dict) and "status" in data and "timestamp" in data:
                    # Ya está envuelto, retornar tal cual preservando cookies
                    headers = dict(response.headers)
                    headers.pop("content-length", None)
                    new_resp = JSONResponse(
                        content=data,
                        status_code=response.status_code,
                        headers=headers
                    )
                    _copy_cookies(response, new_resp)
                    return new_resp
                
                # Si no está envuelto y es una respuesta exitosa (2xx), envolver
                if 200 <= response.status_code < 300:
                    wrapped_data = success_response(
                        data=data,
                        message="Operación exitosa",
                        request=request,
                        status_code=response.status_code
                    )
                    
                    # Remover content-length para que se recalcule
                    headers = dict(response.headers)
                    headers.pop("content-length", None)

                    new_resp = JSONResponse(
                        content=wrapped_data,
                        status_code=response.status_code,
                        headers=headers
                    )
                    _copy_cookies(response, new_resp)
                    return new_resp
                else:
                    # Para códigos de error, retornar sin modificar
                    headers = dict(response.headers)
                    headers.pop("content-length", None)
                    new_resp = JSONResponse(
                        content=data,
                        status_code=response.status_code,
                        headers=headers
                    )
                    _copy_cookies(response, new_resp)
                    return new_resp
            
            # Si body está vacío, retornar respuesta original
            return response
            
        except Exception as e:
            logger.error(f"Error en ResponseWrapperMiddleware: {e}")
            # En caso de error, retornar la respuesta original
            return response
