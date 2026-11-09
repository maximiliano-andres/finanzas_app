import os
import time
import jwt
from typing import Dict
from fastapi import HTTPException, status
from dotenv import dotenv_values

config = dotenv_values(".env")

SECRET_KEY = os.getenv("SECRET_KEY") or config.get("JWT_SECRET") or "CAMBIAR_ESTE_SECRETO"
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_SECONDS", 86400))
REFRESH_TOKEN_EXPIRE = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_SECONDS", 604800))

def create_token(data: Dict, exp_delta: int) -> str:
    """
    Genera un token JWT firmado digitalmente a partir de un diccionario de datos y un delta de expiración.
    
    Args:
        data (Dict): Información que se incluirá en el payload del token.
        exp_delta (int): Segundos a sumar a la hora actual para calcular la fecha de expiración ('exp').
        
    Returns:
        str: El token JWT encriptado/firmado en formato string.
    """
    payload = data.copy()
    payload["exp"] = int(time.time()) + exp_delta
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_access_token(user, remember_device: bool = False, mfa_verified: bool = False) -> str:
    """
    Construye el payload del usuario y genera un token JWT de acceso (Access Token).
    
    El payload incluye todos los claims de identidad y autorización esenciales del usuario, 
    así como las banderas de control de MFA y dispositivo de confianza.
    
    Claims incluidos:
    - sub: ID del usuario (cast a string)
    - email: Correo del usuario
    - nombres/apellidos: Datos de identidad básicos para uso directo de plantillas/frontend
    - rol_id / rol_nombre: Atributos para control de accesos basado en roles (RBAC)
    - remember_device / mfa_verified: claims para omitir el flujo 2FA en peticiones recurrentes
    
    Args:
        user (Usuarios): Instancia del modelo ORM del usuario con la relación 'rol' cargada.
        remember_device (bool): True si el usuario marcó recordar dispositivo en login.
        mfa_verified (bool): True si el usuario ya verificó el segundo factor (TOTP/Email OTP).
        
    Returns:
        str: Token JWT firmado.
    """
    data = {
        "sub": str(user.id),
        "email": user.email,
        "primer_nombre": user.nombre_1,
        "segundo_nombre": user.nombres_2,
        "primer_apellido": user.apellido_1,
        "segundo_apellido": user.apellido_2,
        "rol_id": user.rol_id,
        "rut": user.rut,
        "rol_nombre": user.rol.nombre,
        "cargo": user.cargo,
        "remember_device": remember_device,
        "mfa_verified": mfa_verified
    }
    return create_token(data, ACCESS_TOKEN_EXPIRE)


def create_refresh_token(user_id: int) -> str:
    """
    Genera un token de refresco (Refresh Token) con un ciclo de vida largo.
    
    Contiene únicamente el identificador del usuario ('sub') para propósitos de 
    renovación del Access Token sin reautenticación completa.
    
    Args:
        user_id (int): Identificador único del usuario.
        
    Returns:
        str: Token JWT firmado para refresco.
    """
    return create_token(
        {"sub": str(user_id)},
        REFRESH_TOKEN_EXPIRE
    )

def verify_token(token: str) -> Dict:
    """
    Verifica la firma, algoritmo y expiración de un token JWT recibido.
    
    Args:
        token (str): Token JWT serializado.
        
    Raises:
        HTTPException (401): Si el token ha expirado (`jwt.ExpiredSignatureError`).
        HTTPException (401): Si la firma del token no coincide o es inválida (`jwt.InvalidTokenError`).
        
    Returns:
        Dict: Payload decodificado si la verificación es exitosa.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
