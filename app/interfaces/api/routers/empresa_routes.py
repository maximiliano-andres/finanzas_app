from app.domain.models.tabla_empresas import Empresas
from app.infrastructure.db.database import get_db
from app.infrastructure.utils.response_wrapper import success_response, error_response
from app.domain.services.empresa_service import crear_empresa_service
from app.domain.dto.empresasDTO import EmpresasOut, EmpresasIn
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Request, Depends
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.security.auth_token_roles import get_current_user, require_admin
from fastapi import HTTPException


logger = setup_logger("EMPRESA ROUTES")

router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

SELECT_EMPRESAS = select(Empresas)

# --- OBTENER TODOS LOS EMPRESAS ---
@router.get("/empresas", tags=["Empresas"], response_model=list[EmpresasOut])
async def obtener_empresas(
    request: Request,
    limit: int | None = None,
    offset: int | None = None,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Obtener todas las empresas con soporte de paginación opcional"""
    from app.infrastructure.utils.pagination_utils import paginate_query
    
    empresas, total_count = await paginate_query(
        SELECT_EMPRESAS,
        session,
        limit=limit,
        offset=offset
    )
    
    # [DEBUG] logger.debug(f"Empresas retornadas: {len(empresas)}/{total_count}")
    # Retornar lista pura (ORM objects), Pydantic valida y Middleware envuelve
    return empresas


#crear empresa
@router.post("/empresas", tags=["Empresas"], response_model=EmpresasOut)
async def crear_empresa(
    request: Request,
    data: EmpresasIn,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    empresa, error = await crear_empresa_service(data, session)

    if error:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=error)

    logger.info(f"===> Empresa creada exitosamente: {empresa}")
    
    return empresa

#eliminar empresa
@router.delete("/empresas/{id}", tags=["Empresas"], response_model=EmpresasOut)
async def eliminar_empresa(
    request: Request,
    id: int,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    empresa = await session.get(Empresas, id)
    
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    
    await session.delete(empresa)
    await session.commit()

    logger.info(f"===> Empresa eliminada exitosamente: {empresa}")
    
    return empresa

#modificar empresa
@router.put("/empresas/{id}", tags=["Empresas"], response_model=EmpresasOut)
async def modificar_empresa(
    request: Request,
    id: int,
    data: EmpresasIn,
    current_user: dict = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    empresa = await session.get(Empresas, id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    empresa.empresa = data.empresa
    empresa.codigo = data.codigo
    
    try:
        await session.commit()
    except IntegrityError:
        # AUDITORÍA H-11: nombre/código ya usados por otra empresa → antes 500 genérico.
        await session.rollback()
        raise HTTPException(status_code=400, detail="El nombre o código de empresa ya está registrado")

    logger.info(f"===> Empresa modificada exitosamente: {empresa}")
    
    return empresa