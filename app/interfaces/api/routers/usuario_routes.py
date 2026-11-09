from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import IntegrityError
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.utils.response_wrapper import success_response, error_response
from app.infrastructure.db.database import get_db
from app.domain.models.tabla_usuarios import Usuarios
from app.domain.dto.usuariosDTO import UsuariosOut, UsuariosIn
from app.domain.services.usuario_service import crear_usuario_service
from app.infrastructure.security.auth_token_roles import get_current_user, require_admin
from app.infrastructure.security.hashing import hash_password

logger = setup_logger("USUARIOS ROUTES")

# Crear el router
router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

SELECT_USUARIOS = (
    select(Usuarios)
    .options(joinedload(Usuarios.rol))
    .options(joinedload(Usuarios.obras))
)

#obtener usuarios
@router.get("/usuarios", tags=["Usuarios"], response_model=list[UsuariosOut])
async def obtener_usuarios(
    request: Request,
    limit: int | None = None,
    offset: int | None = None,
    # AUDITORÍA H-05: el padrón (emails, RUT, cargos, roles) solo lo consume Administración.
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    """Obtener todos los usuarios desde la base de datos con soporte de paginación opcional"""
    from app.infrastructure.utils.pagination_utils import paginate_query
    
    usuarios, total_count = await paginate_query(
        SELECT_USUARIOS,
        session,
        limit=limit,
        offset=offset
    )
    
    # [DEBUG] logger.debug(f"Usuarios retornados: {len(usuarios)}/{total_count}")
    return usuarios


#crear usuario
@router.post("/usuarios", tags=["Usuarios"])
async def crear_usuario(
    request: Request,
    data: UsuariosIn,                       
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    try:
        usuario, temp_password, error = await crear_usuario_service(data, session)

        if error:
            raise HTTPException(status_code=400, detail=error)

        logger.info(f"===> Usuario creado exitosamente: {usuario.email}")

        # Recargar para asegurar que la relación 'rol' y 'obras' esté presente para el DTO
        await session.refresh(usuario, ["rol", "obras"])

        # Serializar el usuario con el DTO
        usuario_out = UsuariosOut.model_validate(usuario)

        # Retornar datos del usuario + contraseña temporal (visible UNA SOLA VEZ para el admin)
        return {
            **usuario_out.model_dump(),
            "temp_password": temp_password,
        }
    except IntegrityError as e:
        logger.error(f"Error de integridad al crear usuario: {str(e)}")
        # Hacer rollback de seguridad si ocurre un error de la bd y la sesion no estuviera cerrada
        await session.rollback()
        raise HTTPException(status_code=400, detail="El RUT o Email ya existe")

    except Exception as e:
        logger.error(f"Error al crear usuario: {str(e)}")
        raise

#eliminar usuario
@router.delete("/usuarios/{id}", tags=["Usuarios"])
async def eliminar_usuario(
    request: Request,
    id: int,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    usuario = await session.get(Usuarios, id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    try:
        await session.delete(usuario)
        await session.commit()
    except IntegrityError as e:
        # AUDITORÍA H-10: solicitudes/recepcionados/histórico referencian al usuario (FK) → antes 500 genérico.
        await session.rollback()
        logger.warning(f"No se puede eliminar usuario ID {id}: tiene registros asociados ({e.orig.__class__.__name__})")
        raise HTTPException(status_code=409, detail="No se puede eliminar el usuario porque tiene solicitudes o registros asociados")

    logger.info(f"===> Usuario eliminado exitosamente: ID {id}")
    
    return {"status": "success", "message": "Usuario eliminado"}


# Restablecer contraseña de usuario (Administrador)
@router.post("/usuarios/{id}/reset-password", tags=["Usuarios"])
async def restablecer_password_usuario(
    request: Request,
    id: int,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """
    Restablece la contraseña de un usuario existente de forma segura.
    - Genera una contraseña temporal criptográfica.
    - Activa must_change_password=True.
    - Revoca dispositivos de confianza.
    - Envía la nueva contraseña temporal al correo del usuario.
    El administrador nunca visualiza la contraseña.
    """
    from datetime import datetime
    from sqlalchemy import delete
    from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
    from app.domain.services.usuario_service import generar_password_temporal

    usuario = await session.get(Usuarios, id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Generar nueva contraseña temporal segura
    temp_password = generar_password_temporal()
    usuario.hashed_password = hash_password(temp_password)
    usuario.must_change_password = True
    usuario.password_changed_at = datetime.utcnow()

    # Desactivar/restablecer 2FA (MFA) por obligación
    usuario.mfa_enabled = False
    usuario.mfa_secret_encrypted = None
    usuario.mfa_backup_codes = None
    usuario.mfa_verified_at = None

    # Revocar todos los dispositivos de confianza del usuario
    await session.execute(
        delete(DispositivosConfianza).where(DispositivosConfianza.usuario_id == id)
    )
    await session.commit()

    logger.info(f"===> Contraseña restablecida y 2FA desactivado para usuario ID={id} ({usuario.email})")
    return success_response(
        data={
            "id": usuario.id,
            "nombre_1": usuario.nombre_1,
            "apellido_1": usuario.apellido_1,
            "email": usuario.email,
            "temp_password": temp_password,
        },
        message="Contraseña restablecida. Se requiere cambio de contraseña y configuración de 2FA al iniciar sesión.",
        request=request,
    )
# Reenviar contraseña temporal por correo
class SendTempPasswordRequest(BaseModel):
    temp_password: str
    motivo: str | None = "creación"

@router.post("/usuarios/{id}/send-temp-password", tags=["Usuarios"])
async def send_temp_password_email(
    request: Request,
    id: int,
    data: SendTempPasswordRequest,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    """Envía la contraseña temporal generada al correo del usuario recién creado o restablecido."""
    usuario = await session.get(Usuarios, id)
    if not usuario:
        return JSONResponse(status_code=404, content=error_response("Usuario no encontrado.", request=request, status_code=404))

    try:
        from app.infrastructure.mailing.email_service import (
            send_email_async,
            generate_temp_password_email_template,
        )
        html = generate_temp_password_email_template(
            nombre=usuario.nombre_1,
            email=usuario.email,
            temp_password=data.temp_password,
            motivo=data.motivo or "creación",
        )
        subject = "FlujoPago — Tu contraseña ha sido restablecida" if data.motivo == "restablecimiento" else "FlujoPago — Tu contraseña temporal de acceso inicial"
        enviado = await send_email_async(
            to_email=usuario.email,
            subject=subject,
            html_content=html,
        )
        if not enviado:
            logger.warning(f"No se pudo enviar la contraseña temporal a {usuario.email}")
            return JSONResponse(status_code=502, content=error_response(
                "El correo no pudo ser enviado. Verifique el dominio del usuario.",
                request=request,
                status_code=502,
            ))
    except Exception as e:
        logger.error(f"Error al enviar correo de contraseña temporal a {usuario.email}: {e}")
        return JSONResponse(status_code=500, content=error_response("Error interno al enviar el correo.", request=request, status_code=500))

    logger.info(f"===> Contraseña temporal reenviada a {usuario.email}")
    return success_response(
        data={"email": usuario.email},
        message=f"Contraseña temporal enviada exitosamente a {usuario.email}.",
        request=request,
    )


#modificar usuario
#revisar en frot que funcione perfecto(problemas con campos vacios)
@router.put("/usuarios/{id}", tags=["Usuarios"], response_model=UsuariosOut)
async def modificar_usuario(
    request: Request,
    id: int,
    data: UsuariosIn,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    usuario = await session.get(Usuarios, id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    usuario.cargo = data.cargo
    usuario.nombre_1 = data.nombre_1
    usuario.nombres_2 = data.nombres_2
    usuario.apellido_1 = data.apellido_1
    usuario.apellido_2 = data.apellido_2
    usuario.email = data.email
    usuario.rol_id = data.rol_id
    usuario.rut = data.rut
    
    if data.password:
        usuario.hashed_password = hash_password(data.password)
    
    # Manejar obras:
    from app.domain.models.tabla_usuarios_obras import UsuariosObras
    from sqlalchemy import delete, insert
    # Limpiar obras antiguas
    await session.execute(
        delete(UsuariosObras).where(UsuariosObras.usuario_id == usuario.id)
    )
    # Insertar nuevas obras
    if hasattr(data, 'obras_ids') and data.obras_ids:
        obras_values = [{"usuario_id": usuario.id, "obra_id": obra_id} for obra_id in data.obras_ids]
        await session.execute(insert(UsuariosObras).values(obras_values))

    try:
        await session.commit()
    except IntegrityError as e:
        # AUDITORÍA H-09: email/RUT duplicado, rol u obra inexistente → antes 500 genérico (y sin rollback explícito).
        await session.rollback()
        logger.warning(f"Error de integridad al modificar usuario ID {id}: {e.orig.__class__.__name__}")
        raise HTTPException(status_code=400, detail="El RUT o Email ya existe, o el rol/obra indicado no es válido")
    await session.refresh(usuario, ["rol", "obras"])

    logger.info(f"===> Usuario modificado exitosamente: {usuario.email}")
    
    return usuario
