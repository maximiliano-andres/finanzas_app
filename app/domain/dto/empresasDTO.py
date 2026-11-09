from pydantic import BaseModel, ConfigDict
from app.infrastructure.utils.validaciones import validate_carateres_limites_150, validate_carateres_limites_20

# DTO para crear (input)
class EmpresasIn(BaseModel):

    empresa: str
    codigo: str

    _validate_empresa = validate_carateres_limites_150("empresa")
    _validate_codigo = validate_carateres_limites_20("codigo")

# DTO para devolver datos (output)
class EmpresasOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa: str
    codigo: str