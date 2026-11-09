from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.infrastructure.security.jwt_handler import verify_token
from app.infrastructure.db.database import get_db
from app.domain.models.tabla_usuarios import Usuarios

bearer_scheme = HTTPBearer()  # Extrae del header Authorization: Bearer <token>

async def obtener_usuario_token_valido(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db)
):
    token = credentials.credentials

    payload = verify_token(token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido (sin usuario)")

    query = select(Usuarios).where(Usuarios.id == int(user_id))
    usuario = await session.scalar(query)

    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o deshabilitado")

    return usuario
