# schemas.py
from pydantic import BaseModel, ConfigDict
from enum import Enum
from typing import Optional

class EstadoSolicitudProcesos(str, Enum):
    Activo = "ACTIVO"
    Inactivo = "INACTIVO"
    

# DTO para crear (input)
class ProcesosIn(BaseModel):
    nombre: str
    proceso: str
    cuenta_objeto: str
    auxiliar: str | None = None
    estado: EstadoSolicitudProcesos = EstadoSolicitudProcesos.Activo


# DTO para devolver datos (output)
class ProcesosOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    proceso: str
    cuenta_objeto: str
    auxiliar: str | None
    estado: EstadoSolicitudProcesos
