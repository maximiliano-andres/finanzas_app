"""
Gestor centralizado de errores HTTP y excepciones personalizadas.
Maneja todos los tipos de errores comunes y los mapea a templates HTML.
"""
from typing import Dict, Optional, Tuple
from enum import IntEnum
from dataclasses import dataclass


class ErrorCode(IntEnum):
    """Códigos de error HTTP estándar"""
    OK = 200
    BAD_REQUEST = 400
    UNAUTHORIZED = 401
    FORBIDDEN = 403
    NOT_FOUND = 404
    UNPROCESSABLE_ENTITY = 422
    INTERNAL_SERVER_ERROR = 500
    SERVICE_UNAVAILABLE = 503


@dataclass
class ErrorConfig:
    """Configuración de un tipo de error"""
    status_code: int
    template: str
    title: str
    description: str


class ErrorHandler:
    """
    Gestor centralizado de errores.
    Mapea excepciones y códigos HTTP a templates y mensajes personalizados.
    """
    
    # Mapeo de códigos HTTP a configuraciones
    ERROR_MAPPINGS: Dict[int, ErrorConfig] = {
        ErrorCode.UNAUTHORIZED: ErrorConfig(
            status_code=401,
            template="error_401.html",
            title="Autenticación Requerida",
            description="No tienes autorización para acceder a este recurso."
        ),
        ErrorCode.FORBIDDEN: ErrorConfig(
            status_code=403,
            template="error_403.html",
            title="Permiso Insuficiente",
            description="No tienes permiso para acceder a este recurso."
        ),
        ErrorCode.NOT_FOUND: ErrorConfig(
            status_code=404,
            template="error_404.html",
            title="Galería No Encontrada",
            description="La zona de excavación solicitada no existe o ha sido sellada."
        ),
        ErrorCode.UNPROCESSABLE_ENTITY: ErrorConfig(
            status_code=422,
            template="error_422.html",
            title="Error de Validación",
            description="Los datos enviados contienen errores o están incompletos."
        ),
        ErrorCode.INTERNAL_SERVER_ERROR: ErrorConfig(
            status_code=500,
            template="error_500.html",
            title="Error en las Operaciones",
            description="Se ha detectado un problema crítico en nuestros sistemas."
        ),
    }
    
    # Mapeo de excepciones a códigos de error
    EXCEPTION_MAPPINGS: Dict[type, int] = {
        ValueError: ErrorCode.UNPROCESSABLE_ENTITY,
        PermissionError: ErrorCode.FORBIDDEN,
        FileNotFoundError: ErrorCode.NOT_FOUND,
        KeyError: ErrorCode.NOT_FOUND,
    }
    
    # Mapeo de palabras clave en excepciones a códigos de error
    EXCEPTION_KEYWORDS: Dict[str, int] = {
        "no existe": ErrorCode.NOT_FOUND,
        "not found": ErrorCode.NOT_FOUND,
        "duplicado": ErrorCode.UNPROCESSABLE_ENTITY,
        "unique": ErrorCode.UNPROCESSABLE_ENTITY,
        "permisos": ErrorCode.FORBIDDEN,
        "permission": ErrorCode.FORBIDDEN,
        "autenticación": ErrorCode.UNAUTHORIZED,
        "authentication": ErrorCode.UNAUTHORIZED,
        "timeout": ErrorCode.SERVICE_UNAVAILABLE,
        "conexión": ErrorCode.INTERNAL_SERVER_ERROR,
        "database": ErrorCode.INTERNAL_SERVER_ERROR,
        "validación": ErrorCode.UNPROCESSABLE_ENTITY,
        "validation": ErrorCode.UNPROCESSABLE_ENTITY,
    }
    
    @classmethod
    def get_error_config(cls, status_code: int) -> Optional[ErrorConfig]:
        """Obtiene la configuración de error para un código HTTP"""
        return cls.ERROR_MAPPINGS.get(status_code)
    
    @classmethod
    def get_template_for_status(cls, status_code: int) -> str:
        """Obtiene el template para un código de estado"""
        config = cls.get_error_config(status_code)
        return config.template if config else "error_500.html"
    
    @classmethod
    def detect_error_code_from_exception(cls, exception: Exception) -> int:
        """
        Detecta automáticamente el código de error desde una excepción.
        Primero intenta coincidencia de tipo, luego búsqueda de palabras clave.
        """
        exc_type = type(exception)
        
        # Intentar coincidir por tipo de excepción
        if exc_type in cls.EXCEPTION_MAPPINGS:
            return cls.EXCEPTION_MAPPINGS[exc_type]
        
        # Intentar coincidir por palabra clave en el mensaje
        error_message = str(exception).lower()
        for keyword, status_code in cls.EXCEPTION_KEYWORDS.items():
            if keyword in error_message:
                return status_code
        
        # Por defecto, error 500
        return ErrorCode.INTERNAL_SERVER_ERROR
    
    @classmethod
    def get_error_info(cls, status_code: int) -> Tuple[str, str, str]:
        """
        Obtiene (template, titulo, descripción) para un código de error.
        Retorna valores por defecto si el código no está mapeado.
        """
        config = cls.get_error_config(status_code)
        if config:
            return config.template, config.title, config.description
        
        # Valores por defecto para errores no mapeados
        return "error_500.html", "Error Desconocido", "Ha ocurrido un error inesperado"

    @classmethod
    def get_safe_error_message(cls, status_code: int) -> str:
        """
        Retorna un mensaje seguro para el cliente basado en el status_code.
        Ideal para evitar exponer detalles internos en la API.
        """
        config = cls.get_error_config(status_code)
        if config:
            return config.description
        
        return "Ha ocurrido un error interno en el servidor"
