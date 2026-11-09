from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from fastapi import HTTPException, status

from app.domain.models.tabla_usuarios import Usuarios
from app.infrastructure.security.hashing import verify_password

from app.infrastructure.security.jwt_handler import (
    create_access_token,
    create_refresh_token
)

async def login_service(email: str, password: str, session: AsyncSession, remember_device: bool = False, mfa_verified: bool = False) -> dict:
    """
    Servicio de autenticación principal de usuarios en el sistema.
    
    Busca al usuario por correo electrónico e intenta autenticarlo comparando el hash de la 
    contraseña. Si es exitoso, genera tokens JWT de acceso y refresco.
    
    Flujo técnico:
    - Realiza una consulta SQL con `joinedload(Usuarios.rol)` para cargar de forma anticipada (eager loading) 
      la relación de Rol. Esto es crítico para evitar llamadas SQL subsiguientes (N+1 query problem) 
      al generar los claims de roles en el token de acceso.
    - Valida existencia del usuario y compara la contraseña actual contra el hash Argon2.
    - Crea el token de acceso inicial. Por defecto, en el primer paso de login, `mfa_verified` es `False`, 
      lo que indica que la sesión está incompleta a menos que no tenga activado el 2FA.
      
    Args:
        email (str): Correo electrónico provisto por el usuario.
        password (str): Contraseña en texto plano provista.
        session (AsyncSession): Sesión asíncrona de base de datos activa.
        remember_device (bool): Bandera que indica si se debe recordar el dispositivo del cliente.
        mfa_verified (bool): Estado inicial de verificación de MFA para el token generado.
        
    Raises:
        HTTPException (404): Si el correo no coincide con ningún usuario registrado.
        HTTPException (401): Si la contraseña provista es incorrecta.
        
    Returns:
        dict: Diccionario conteniendo 'access_token', 'refresh_token' y 'token_type'.
    """
    query = select(Usuarios).where(Usuarios.email == email).options(joinedload(Usuarios.rol))
    result = await session.execute(query)
    usuario = result.scalar_one_or_none()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not verify_password(usuario.hashed_password, password):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")


    access_token = create_access_token(usuario, remember_device=remember_device, mfa_verified=mfa_verified)
    refresh_token = create_refresh_token(usuario.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }
