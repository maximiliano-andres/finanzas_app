# schemas.py
from pydantic import BaseModel, ConfigDict
from app.infrastructure.utils.validaciones import validate_carateres_limites_20, validate_carateres_limites_150
from enum import Enum

class EstadoSolicitudProcesosAuxiliares(str, Enum):
    Activo = "ACTIVO"
    Inactivo = "INACTIVO"


# DTO para crear (input)
class ProcesosAuxiliaresIn(BaseModel):

    numero: str
    detalle: str
    auxiliar: str
    estado: EstadoSolicitudProcesosAuxiliares = EstadoSolicitudProcesosAuxiliares.Activo

    _numero = validate_carateres_limites_20("numero")
    _detalle = validate_carateres_limites_150("detalle")
    _auxiliar = validate_carateres_limites_20("auxiliar")

# DTO para devolver datos (output)
class ProcesosAuxiliaresOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    numero: str
    detalle: str
    auxiliar: str
    estado: EstadoSolicitudProcesosAuxiliares