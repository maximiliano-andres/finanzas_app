from app.infrastructure.db.database import get_db
from app.infrastructure.utils.response_wrapper import success_response
from app.domain.dto.rolesDTO import RolesOut
from app.domain.models.tabla_roles import Roles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Request, Depends
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.security.auth_token_roles import get_current_user

logger = setup_logger("ROLES ROUTES")

router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

SELECT_ROLES = select(Roles)

@router.get("/roles", tags=["Roles"], response_model=list[RolesOut])
async def obtener_roles(
    request: Request,
    limit: int | None = None,
    offset: int | None = None,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Obtener todos los roles con soporte de paginación opcional"""
    from app.infrastructure.utils.pagination_utils import paginate_query
    
    roles, total_count = await paginate_query(
        SELECT_ROLES,
        session,
        limit=limit,
        offset=offset
    )
    
    # [DEBUG] logger.debug(f"Roles retornados: {len(roles)}/{total_count}")
    return roles

    
'''@router.post("/roles", tags=["Roles"], response_model=RolesOut)
async def login(request: Request, username: str, password: str):
    """Endpoint de login (ejemplo)"""
    return success_response(
        data={"token": "ejemplo-token-jwt", "username": username},
        message="Login exitoso",
        request=request
    )
'''