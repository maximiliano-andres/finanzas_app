from typing import Any, Optional
from datetime import datetime, timezone, timedelta
from fastapi import Request
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("RESPONSE_WRAPPER")

from app.domain.schemas.response_schemas import (
    APIResponse, 
    ResponseStatus, 
    ErrorDetail
)


TIMEZONE_ARG = timezone(timedelta(hours=-3))


def get_current_timestamp() -> str:

    return datetime.now(TIMEZONE_ARG).isoformat()



def success_response(
    data: Any,
    message: str = "Operación exitosa",
    request: Optional[Request] = None,
    path: str = "",
    method: str = "GET",
    status_code: int = 200
) -> dict:
    """
    Formatea de manera uniforme las respuestas exitosas de la API.
    
    Flujo de ejecución:
    - Extrae el método y la ruta de la petición a partir del objeto `Request` si es provisto.
    - Genera una estampa de tiempo local sincronizada a la zona horaria definida (-3 UTF Chile).
    - Sanitiza la salida en los registros de producción: Para mitigar fugas de PII o contraseñas, 
      el payload completo `"data"` es excluido del logger a nivel `INFO`, registrando únicamente 
      los metadatos de acceso. La respuesta con el payload completo queda comentada como log de tipo `DEBUG`.
      
    Args:
        data (Any): El cuerpo/payload de datos de respuesta a retornar al cliente.
        message (str): Breve descripción de la operación.
        request (Request, opcional): Objeto Request de FastAPI.
        path (str, opcional): Ruta manual si no se provee request.
        method (str, opcional): Método HTTP manual.
        status_code (int): Código HTTP.
        
    Returns:
        dict: Diccionario formateado compatible con el esquema `APIResponse` de la aplicación.
    """
    # Extraer path y method del request si está disponible
    if request:
        path = request.url.path
        method = request.method

    info_success_response = {
        "status": ResponseStatus.SUCCESS.value,
        "code": status_code,
        "timestamp": get_current_timestamp(),
        "path": path,
        "method": method,
        "message": message,
        "data": data
    }
    
    # For production: Log only metadata, not the full response payload 'data' to avoid exposure of sensitive information
    log_metadata = {k: v for k, v in info_success_response.items() if k != "data"}
    logger.info(log_metadata)
    # [DEBUG] logger.debug(info_success_response)
    
    return info_success_response


def error_response(
    message: str,
    errors: Optional[list[dict]] = None,
    request: Optional[Request] = None,
    path: str = "",
    method: str = "GET",
    status_code: int = 400
) -> dict:
    """
    Formatea de manera uniforme las respuestas de error y validación fallida.
    
    Flujo de ejecución:
    - Construye un listado estructurado de errores (`ErrorDetail`) si se provee el listado de fallos.
    - Sanitiza la salida en los registros de producción: El listado completo de `"errors"` (que podría 
      contener trazas sensibles o datos de entrada del usuario) es excluido del logger a nivel `ERROR`, 
      salvaguardando la confidencialidad. La traza detallada se mantiene comentada como log de tipo `DEBUG`.
      
    Args:
        message (str): Descripción corta legible del error.
        errors (list[dict], opcional): Lista de fallos o validaciones Pydantic específicas.
        request (Request, opcional): Objeto Request de FastAPI.
        path (str, opcional): Ruta manual.
        method (str, opcional): Método HTTP.
        status_code (int): Código de estado HTTP.
        
    Returns:
        dict: Diccionario formateado estructurado.
    """

    # Extraer path y method del request si está disponible
    if request:
        path = request.url.path
        method = request.method
    
    # Convertir errores a ErrorDetail si no están vacíos
    error_details = None
    if errors:
        error_details = [
            ErrorDetail(**error) if isinstance(error, dict) else error
            for error in errors
        ]
    
    response_data = {
        "status": ResponseStatus.ERROR.value,
        "code": status_code,
        "timestamp": get_current_timestamp(),
        "path": path,
        "method": method,
        "message": message,
    }
    
    if error_details:
        response_data["errors"] = [
            error.model_dump() if isinstance(error, ErrorDetail) else error
            for error in error_details
        ]

    # For production: Log only metadata, not the full 'errors' payload to avoid internal info leakage
    log_metadata = {k: v for k, v in response_data.items() if k != "errors"}
    logger.error(log_metadata)
    # [DEBUG] logger.debug(response_data)
    
    return response_data
