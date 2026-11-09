from typing import Any, Optional, Generic, TypeVar
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class ResponseStatus(str, Enum):
    """Estados posibles de una respuesta API"""
    SUCCESS = "success"
    ERROR = "error"


class ErrorDetail(BaseModel):
    """Detalle de un error en la respuesta"""
    code: str = Field(..., description="Código del error")
    message: str = Field(..., description="Mensaje descriptivo del error")
    field: Optional[str] = Field(None, description="Campo relacionado al error (si aplica)")


T = TypeVar('T')


class APIResponse(BaseModel, Generic[T]):
    
    status: ResponseStatus = Field(..., description="Estado de la respuesta")
    timestamp: str = Field(..., description="Timestamp de la respuesta en ISO 8601")
    path: str = Field(..., description="Ruta de la solicitud")
    method: str = Field(..., description="Método HTTP de la solicitud")
    message: str = Field(..., description="Mensaje descriptivo")
    data: Optional[T] = Field(None, description="Datos de la respuesta (solo en success)")
    errors: Optional[list[ErrorDetail]] = Field(None, description="Detalles de errores (solo en error)")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "timestamp": "2025-12-01T23:07:00-03:00",
                "path": "/usuarios",
                "method": "GET",
                "message": "Operación exitosa",
                "data": {"id": 1, "nombre": "Juan"}
            }
        }
