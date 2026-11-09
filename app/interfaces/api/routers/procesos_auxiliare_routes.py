from app.domain.models.tabla_procesos_auxiliares import ProcesosAuxiliares
from app.domain.dto.procesos_auxiliaresDTO import ProcesosAuxiliaresIn, ProcesosAuxiliaresOut
from app.domain.services.proceso_auxiliares_service import crear_proceso_auxiliar_service
from app.infrastructure.db.database import get_db
from sqlalchemy import select
from fastapi import APIRouter, Depends, Request
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.utils.response_wrapper import success_response, error_response
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.security.auth_token_roles import get_current_user, require_admin

logger = setup_logger("PROCESOS AUXILIARES ROUTES")

router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

SELECT_PROCESOS_AUXILIARES = select(ProcesosAuxiliares)

#procesos_auxiliares
@router.get("/procesos_auxiliares", tags=["Procesos auxiliares"], response_model=list[ProcesosAuxiliaresOut])
async def obtener_procesos_auxiliares(
    request: Request,
    limit: int | None = None,
    offset: int | None = None,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Obtener todos los procesos auxiliares con soporte de paginación"""
    from app.infrastructure.utils.pagination_utils import paginate_query
    
    role = current_user.get("rol_nombre")
    user_id = int(current_user.get("sub"))
    
    query = SELECT_PROCESOS_AUXILIARES
    
    if role not in ["Administrador", "Supervisor"]:
        from app.domain.models.tabla_usuarios_obras import UsuariosObras
        query = query.join(UsuariosObras, ProcesosAuxiliares.id == UsuariosObras.obra_id).where(UsuariosObras.usuario_id == user_id)
        
    procesos_auxiliares, total_count = await paginate_query(
        query,
        session,
        limit=limit,
        offset=offset
    )
    
    # [DEBUG] logger.debug(f"Procesos auxiliares retornados: {len(procesos_auxiliares)}/{total_count}")
    return procesos_auxiliares


#crear proceso auxiliar
@router.post("/procesos_auxiliares", tags=["Procesos auxiliares"], response_model=ProcesosAuxiliaresOut)
async def crear_proceso_auxiliar(
    request: Request,
    data: ProcesosAuxiliaresIn,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    proceso_auxiliar, error = await crear_proceso_auxiliar_service(data, session)

    if error:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=error)

    logger.info(f"===> Proceso auxiliar creado exitosamente: {proceso_auxiliar}")
    
    proceso_auxiliar_creado = ProcesosAuxiliaresOut.model_validate(proceso_auxiliar).model_dump()
    
    return proceso_auxiliar_creado


#eliminar proceso auxiliar
@router.delete("/procesos_auxiliares/{id}", tags=["Procesos auxiliares"], response_model=ProcesosAuxiliaresOut)
async def eliminar_proceso_auxiliar(
    request: Request,
    id: int,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    proceso_auxiliar = await session.get(ProcesosAuxiliares, id)
    if not proceso_auxiliar:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Proceso auxiliar no encontrado")
    
    # Store data before deletion for response
    response_data = {
        "id": proceso_auxiliar.id,
        "numero": proceso_auxiliar.numero,
        "detalle": proceso_auxiliar.detalle,
        "auxiliar": proceso_auxiliar.auxiliar,
        "estado": proceso_auxiliar.estado,
    }

    await session.delete(proceso_auxiliar)
    await session.commit()

    logger.info(f"===> Proceso auxiliar eliminado exitosamente: {proceso_auxiliar}")

    return response_data

#modificar proceso auxiliar
@router.put("/procesos_auxiliares/{id}", tags=["Procesos auxiliares"], response_model=ProcesosAuxiliaresOut)
async def modificar_proceso_auxiliar(
    request: Request,
    id: int,
    data: ProcesosAuxiliaresIn,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    proceso_auxiliar = await session.get(ProcesosAuxiliares, id)
    if not proceso_auxiliar:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Proceso auxiliar no encontrado")
    
    # Verificar duplicados en OTRO registro
    if data.numero != proceso_auxiliar.numero:
        existing = await session.execute(
            select(ProcesosAuxiliares.id).where(ProcesosAuxiliares.numero == data.numero)
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Ya existe un proceso auxiliar con el número {data.numero}")
            
    if data.detalle != proceso_auxiliar.detalle:
        existing = await session.execute(
            select(ProcesosAuxiliares.id).where(ProcesosAuxiliares.detalle == data.detalle)
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Ya existe un proceso auxiliar con el detalle '{data.detalle}'")
            
    if data.auxiliar != proceso_auxiliar.auxiliar:
        existing = await session.execute(
            select(ProcesosAuxiliares.id).where(ProcesosAuxiliares.auxiliar == data.auxiliar)
        )
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Ya existe un proceso auxiliar con el código auxiliar {data.auxiliar}")
    
    proceso_auxiliar.numero = data.numero
    proceso_auxiliar.detalle = data.detalle
    proceso_auxiliar.auxiliar = data.auxiliar
    proceso_auxiliar.estado = data.estado.value
    
    await session.commit()

    logger.info(f"===> Proceso auxiliar modificado exitosamente: {proceso_auxiliar}")
    
    proceso_auxiliar_modificado = ProcesosAuxiliaresOut.model_validate(proceso_auxiliar).model_dump()
    
    return proceso_auxiliar_modificado  