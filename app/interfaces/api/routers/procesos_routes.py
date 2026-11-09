from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.db.database import get_db
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.utils.response_wrapper import success_response, error_response
from app.domain.models.tabla_procesos import Procesos
from app.domain.dto.procesosDTO import ProcesosIn, ProcesosOut
from app.domain.services.procesos_service import crear_proceso_service
from sqlalchemy import select
from app.infrastructure.security.auth_token_roles import get_current_user, require_admin

logger = setup_logger("PROCESOS ROUTES")


router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

SELECT_PROCESOS = select(Procesos)

# --- OBTENER TODOS LOS PROCESOS ---
@router.get("/procesos", tags=["Procesos"], response_model=list[ProcesosOut])
async def obtener_procesos(
    request: Request,
    limit: int | None = None,
    offset: int | None = None,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Obtener todos los procesos con soporte de paginación opcional"""
    from app.infrastructure.utils.pagination_utils import paginate_query
    
    procesos, total_count = await paginate_query(
        SELECT_PROCESOS,
        session,
        limit=limit,
        offset=offset
    )
    
    # [DEBUG] logger.debug(f"Procesos retornados: {len(procesos)}/{total_count}")
    return procesos


#crear proceso
@router.post("/procesos", tags=["Procesos"], response_model=ProcesosOut)
async def crear_proceso(
    request: Request,
    data: ProcesosIn,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    proceso, error = await crear_proceso_service(data, session)

    if error:
        logger.error(f"Error al crear proceso: {error}")
        raise HTTPException(status_code=400, detail=error)

    logger.info(f"===> Proceso creado exitosamente: {proceso}")
    
    proceso_creado = ProcesosOut.model_validate(proceso).model_dump()
    
    return proceso_creado


#eliminar proceso
@router.delete("/procesos/{id}", tags=["Procesos"], response_model=ProcesosOut)
async def eliminar_proceso(
    request: Request,
    id: int,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    proceso = await session.get(Procesos, id)
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")
    
    response_data = {
        "id": proceso.id,
        "nombre": proceso.nombre,
        "proceso": proceso.proceso,
        "cuenta_objeto": proceso.cuenta_objeto,
        "auxiliar": proceso.auxiliar,
        "estado": proceso.estado,
    }
    
    await session.delete(proceso)
    await session.commit()

    logger.info(f"===> Proceso eliminado exitosamente: {proceso}")
    
    return response_data

#modificar proceso
@router.put("/procesos/{id}", tags=["Procesos"], response_model=ProcesosOut)
async def modificar_proceso(
    request: Request,
    id: int,
    data: ProcesosIn,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    proceso = await session.get(Procesos, id)
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")
    
    proceso.nombre = data.nombre.upper()
    proceso.proceso = data.proceso.upper()
    proceso.cuenta_objeto = data.cuenta_objeto
    proceso.auxiliar = data.auxiliar
    proceso.estado = data.estado.value
    
    await session.commit()

    logger.info(f"===> Proceso modificado exitosamente: {proceso}")
    
    proceso_modificado = ProcesosOut.model_validate(proceso).model_dump()
    
    return proceso_modificado
