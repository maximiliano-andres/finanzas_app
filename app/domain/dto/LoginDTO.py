# app/domain/dto/authDTO.py
from pydantic import BaseModel, EmailStr
from app.infrastructure.utils.validaciones import validate_corporate_email

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    remember_device: bool = False

    _email = validate_corporate_email("email")
