# schemas.py
from pydantic import BaseModel, ConfigDict

# DTO para crear (input)
class RolesIn(BaseModel):
    id: int
    nombre: str

# DTO para devolver datos (output)
class RolesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str