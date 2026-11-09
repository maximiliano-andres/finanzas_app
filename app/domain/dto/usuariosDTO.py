from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict, computed_field, Field
from app.domain.dto.rolesDTO import RolesOut

from app.infrastructure.utils.validaciones import (
    validate_required_name,
    validate_optional_name,
    validate_positive_id,
    validate_password,
    validate_corporate_email,
    validate_rut
)

from enum import Enum


class CargosDisponibles(str, Enum):
    jefe_RRHH = "Jefe de Recursos Humanos"
    subgerente_capital_humano = "Subgerente de Capital Humano"
    Analista_personal = "Analista de personal" # debe remplazar a todas las etapas de Solicitante
    jefe_finanzas = "Jefe de Finanzas"
    administrador = "Administrador"
    

class UsuariosIn(BaseModel):
    cargo: CargosDisponibles
    nombre_1: str
    nombres_2: str | None = None
    apellido_1: str
    apellido_2: str | None = None
    email: EmailStr
    rol_id: int
    rut: str
    password: str | None = None
    password_2: str | None = None
    obras_ids: list[int] = []

    # Validaciones
    _nombre_1 = validate_required_name("nombre_1")
    _nombres_2 = validate_optional_name("nombres_2")
    _apellido_1 = validate_required_name("apellido_1")
    _apellido_2 = validate_optional_name("apellido_2")
    _email = validate_corporate_email("email")
    _rol_id = validate_positive_id("rol_id")
    _rut = validate_rut("rut") #crar validaciones ext4ranjeros

    _password = validate_password("password")
    _password_2 = validate_password("password_2")

class UsuariosOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cargo: CargosDisponibles
    nombre_1: str
    nombres_2: str | None = None
    apellido_1: str
    apellido_2: str | None = None
    email: EmailStr
    rol_id: int
    rut: str
    created_at: datetime
    rol: RolesOut | None = Field(default=None, exclude=True) #ignora el campo
    obras: list = Field(default=[], exclude=True)

    @computed_field
    @property
    def rol_nombre(self) -> str:
        return self.rol.nombre if self.rol else "Desconocido"

    @computed_field
    @property
    def obras_ids(self) -> list[int]:
        return [obra.id for obra in self.obras] if self.obras else []