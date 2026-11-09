from fastapi import APIRouter, Depends, Request, Response, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.infrastructure.db.database import get_db
from app.infrastructure.security.auth_token_roles import get_current_user
from app.domain.models.tabla_usuarios import Usuarios
from app.infrastructure.utils.response_wrapper import success_response, error_response as _error_body
from fastapi.responses import JSONResponse


def error_response(message: str, request=None, status_code: int = 400) -> JSONResponse:
    """AUDITORÍA H-29: mismo cuerpo de error, pero con el código HTTP real (antes siempre HTTP 200)."""
    return JSONResponse(status_code=status_code, content=_error_body(message, request=request, status_code=status_code))
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.security.hashing import hash_password, verify_password

from app.domain.dto.mfaDTO import PasswordChangeRequest, PasswordForceChangeRequest

logger = setup_logger("PASSWORD_ROUTES")
router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

@router.post("/password/change", tags=["Auth", "Password"])
async def change_password(
    request: Request,
    response: Response,
    data: PasswordChangeRequest,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Cambia la contraseña validando la contraseña actual."""
    user_id = int(current_user_dict["sub"])
    usuario = await session.get(Usuarios, user_id)
    
    if not verify_password(usuario.hashed_password, data.old_password):
        logger.warning(f"Intento fallido de cambio de contraseña para usuario ID={user_id}: Contraseña actual incorrecta.")
        return error_response("La contraseña actual es incorrecta.", request=request, status_code=400)
        
    if data.new_password != data.confirm_password:
        logger.warning(f"Intento fallido de cambio de contraseña para usuario ID={user_id}: Confirmación de contraseña no coincide.")
        return error_response("Las nuevas contraseñas no coinciden.", request=request, status_code=400)
        
    # La validación de complejidad la hace pydantic si usamos los validators de validaciones.py
    # Aquí podríamos agregar los validadores explicitamente si no están en el DTO, pero ya se verifican al instanciar PasswordChangeRequest si heredamos.
    # Dado que es un request rapido, confiaremos en los validadores o lo asignaremos directamente:
    
    usuario.hashed_password = hash_password(data.new_password)
    usuario.password_changed_at = datetime.utcnow()
    usuario.must_change_password = False
    
    # Revocar todos los dispositivos de confianza
    from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
    from sqlalchemy import delete
    await session.execute(
        delete(DispositivosConfianza).where(DispositivosConfianza.usuario_id == user_id)
    )
    await session.commit()
    logger.info(f"Contraseña cambiada exitosamente para usuario ID={user_id}.")
    
    # Borrar la cookie del dispositivo de confianza
    response.delete_cookie(
        key="trusted_device",
        httponly=True,
        secure=False,
        samesite="lax",
    )
    
    return success_response(data=None, message="Contraseña cambiada exitosamente.", request=request)

@router.post("/password/force-change", tags=["Auth", "Password"])
async def force_change_password(
    request: Request,
    response: Response,
    data: PasswordForceChangeRequest,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Cambio de contraseña obligatorio. Requiere la anterior y valida complejidad."""
    user_id = int(current_user_dict["sub"])
    usuario = await session.get(Usuarios, user_id)
    
    if not usuario.must_change_password:
        return error_response("No es necesario un cambio de contraseña obligatorio.", request=request, status_code=400)
        
    if not verify_password(usuario.hashed_password, data.old_password):
        logger.warning(f"Intento fallido de cambio obligatorio de contraseña para usuario ID={user_id}: Contraseña actual incorrecta.")
        return error_response("La contraseña actual es incorrecta.", request=request, status_code=400)
        
    if data.new_password != data.confirm_password:
        logger.warning(f"Intento fallido de cambio obligatorio de contraseña para usuario ID={user_id}: Confirmación de contraseña no coincide.")
        return error_response("Las contraseñas no coinciden.", request=request, status_code=400)
        
    usuario.hashed_password = hash_password(data.new_password)
    usuario.password_changed_at = datetime.utcnow()
    usuario.must_change_password = False
    
    # Revocar todos los dispositivos de confianza
    from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
    from sqlalchemy import delete
    await session.execute(
        delete(DispositivosConfianza).where(DispositivosConfianza.usuario_id == user_id)
    )
    await session.commit()
    logger.info(f"Contraseña inicial cambiada exitosamente para usuario ID={user_id}.")
    
    # Borrar la cookie del dispositivo de confianza
    response.delete_cookie(
        key="trusted_device",
        httponly=True,
        secure=False,
        samesite="lax",
    )
    
    return success_response(data=None, message="Contraseña inicial cambiada exitosamente.", request=request)

