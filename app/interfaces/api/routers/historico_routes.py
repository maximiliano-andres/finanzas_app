"""
Rutas para consultar el histórico de solicitudes
Permite ver todos los cambios de estado registrados para una solicitud
"""
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.infrastructure.db.database import get_db
from app.domain.models.tabla_historico import TablaHistorico
from app.domain.dto.historicoDTO import HistoricoOut
from app.infrastructure.security.auth_token_roles import get_current_user
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("HISTORICO_ROUTES")

router = APIRouter(prefix="/flujopago/gestion-pagos/v1")


async def _condiciones_alcance(current_user: dict, session: AsyncSession) -> list:
    """
    Filtro de alcance del histórico (mismo criterio que GET /historico): sin restricción para roles/cargos de
    alta visibilidad; el resto solo ve sus registros (usuario_id o nombre) dentro de sus obras asignadas.
    AUDITORÍA H-05b: /estado, /solicitante y /estadisticas no lo aplicaban y exponían el histórico completo.
    """
    from sqlalchemy import or_, and_, false
    from app.domain.models.tabla_usuarios_obras import UsuariosObras
    from app.domain.models.tabla_procesos_auxiliares import ProcesosAuxiliares

    role = current_user.get("rol_nombre")
    cargo = current_user.get("cargo")
    if (role in ["Administrador", "Supervisor", "Responsable Finanzas"] or
            cargo in ["Jefe de Recursos Humanos", "Subgerente de Capital Humano", "Jefe de Finanzas"]):
        return []

    user_id = int(current_user.get("sub"))
    user_name = current_user.get("nombre") or current_user.get("primer_nombre")
    obras_usuario = await session.execute(
        select(ProcesosAuxiliares.detalle)
        .join(UsuariosObras, ProcesosAuxiliares.id == UsuariosObras.obra_id)
        .where(UsuariosObras.usuario_id == user_id)
    )
    obras_permitidas = obras_usuario.scalars().all()
    if not obras_permitidas:
        return [false()]
    condicion_usuario = or_(
        TablaHistorico.usuario_id == user_id,
        TablaHistorico.solicitante == user_name
    )
    return [and_(condicion_usuario, TablaHistorico.obra.in_(obras_permitidas))]


@router.get(
    "/historico/solicitud/{id_solicitud}",
    tags=["Histórico"],
    response_model=list[HistoricoOut],
    summary="Obtener histórico de cambios de una solicitud"
)
async def obtener_historico_solicitud(
    id_solicitud: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Obtiene todos los cambios de estado registrados de una solicitud específica.
    
    **Parámetros:**
    - `id_solicitud`: ID de la solicitud para la cual consultar el histórico
    
    **Retorna:**
    Lista de registros del histórico ordenados por fecha (más recientes primero)
    
    **Ejemplo:**
    ```
    GET /historico/solicitud/123
    ```
    """
    try:
        # Aplicar filtros de seguridad si no es administrador
        user_id = int(current_user.get("sub"))
        user_name = current_user.get("nombre") or current_user.get("primer_nombre")
        role = current_user.get("rol_nombre")
        cargo = current_user.get("cargo")

        # Obtener todos los registros de histórico para esta solicitud
        stmt = select(TablaHistorico).where(
            TablaHistorico.id_solicitud_origen == id_solicitud
        )

        if (role not in ["Administrador", "Supervisor", "Responsable Finanzas"] and 
            cargo not in ["Jefe de Recursos Humanos", "Subgerente de Capital Humano", "Jefe de Finanzas"]):
            from sqlalchemy import or_
            from app.domain.models.tabla_usuarios_obras import UsuariosObras
            from app.domain.models.tabla_procesos_auxiliares import ProcesosAuxiliares
            
            obras_usuario = await session.execute(
                select(ProcesosAuxiliares.detalle)
                .join(UsuariosObras, ProcesosAuxiliares.id == UsuariosObras.obra_id)
                .where(UsuariosObras.usuario_id == user_id)
            )
            obras_permitidas = obras_usuario.scalars().all()

            from sqlalchemy import and_, false
            condicion_usuario = or_(
                TablaHistorico.usuario_id == user_id,
                TablaHistorico.solicitante == user_name
            )
            if obras_permitidas:
                stmt = stmt.where(and_(condicion_usuario, TablaHistorico.obra.in_(obras_permitidas)))
            else:
                stmt = stmt.where(false())

        stmt = stmt.order_by(TablaHistorico.fecha_registro_historico.desc())
        
        result = await session.execute(stmt)
        historicos = result.unique().scalars().all()
        
        if not historicos:
            # [DEBUG] logger.debug(f"No hay histórico registrado para solicitud {id_solicitud}")
            return []
        
        # [DEBUG] logger.debug(f"Se obtuvieron {len(historicos)} registros de histórico para solicitud {id_solicitud}")
        return historicos
        
    except Exception as e:
        logger.error(f"Error al obtener histórico de solicitud {id_solicitud}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener histórico: {str(e)}")


@router.get(
    "/historico",
    tags=["Histórico"],
    response_model=list[HistoricoOut],
    summary="Obtener todo el histórico"
)
async def obtener_todo_historico(
    limit: int | None = None,
    offset: int | None = None,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Obtiene todos los registros del histórico con paginación opcional.
    
    **Parámetros:**
    - `limit`: Cantidad máxima de registros a retornar (default: sin límite, máximo: 500)
    - `offset`: Cantidad de registros a saltar (default: 0)
    
    **Retorna:**
    Lista de registros del histórico ordenados por fecha (más recientes primero)
    
    **Ejemplo:**
    ```
    GET /historico?limit=50&offset=0
    ```
    """
    from app.infrastructure.utils.pagination_utils import paginate_query
    
    # Aplicar filtros de seguridad si no es administrador
    user_id = int(current_user.get("sub"))
    user_name = current_user.get("nombre") or current_user.get("primer_nombre")
    role = current_user.get("rol_nombre")
    cargo = current_user.get("cargo")

    # Query con orden descendente por fecha
    query = select(TablaHistorico)

    if (role not in ["Administrador", "Supervisor", "Responsable Finanzas"] and 
        cargo not in ["Jefe de Recursos Humanos", "Subgerente de Capital Humano", "Jefe de Finanzas"]):
        from sqlalchemy import or_
        from app.domain.models.tabla_usuarios_obras import UsuariosObras
        from app.domain.models.tabla_procesos_auxiliares import ProcesosAuxiliares
        
        obras_usuario = await session.execute(
            select(ProcesosAuxiliares.detalle)
            .join(UsuariosObras, ProcesosAuxiliares.id == UsuariosObras.obra_id)
            .where(UsuariosObras.usuario_id == user_id)
        )
        obras_permitidas = obras_usuario.scalars().all()

        from sqlalchemy import and_, false
        condicion_usuario = or_(
            TablaHistorico.usuario_id == user_id,
            TablaHistorico.solicitante == user_name
        )
        if obras_permitidas:
            query = query.where(and_(condicion_usuario, TablaHistorico.obra.in_(obras_permitidas)))
        else:
            query = query.where(false())

    query = query.order_by(
        TablaHistorico.fecha_registro_historico.desc()
    )
    
    historicos, total_count = await paginate_query(
        query,
        session,
        limit=limit,
        offset=offset,
        max_limit=500  # Límite máximo específico para histórico
    )
    
    # [DEBUG] logger.debug(f"Histórico retornado: {len(historicos)}/{total_count} (limit={limit}, offset={offset})")
    return historicos



@router.get(
    "/historico/estado/{estado}",
    tags=["Histórico"],
    response_model=list[HistoricoOut],
    summary="Obtener histórico filtrado por estado"
)
async def obtener_historico_por_estado(
    estado: str,
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Obtiene todos los registros del histórico para un estado específico.
    
    **Estados válidos:**
    - PENDIENTE
    - RECHAZADO
    - APROBADO NIVEL 1
    - APROBADO NIVEL 2
    - APROBADO FINANZAS
    - RECEPCIONADO
    
    **Parámetros:**
    - `estado`: El estado a filtrar (mayúsculas)
    - `limit`: Cantidad máxima de registros (default: 100)
    
    **Retorna:**
    Lista de registros que coincidan con el estado
    
    **Ejemplo:**
    ```
    GET /historico/estado/APROBADO%20NIVEL%201
    ```
    """
    try:
        # Convertir a mayúsculas
        estado_upper = estado.upper()
        
        # Estados válidos
        estados_validos = {
            "PENDIENTE",
            "RECHAZADO",
            "APROBADO NIVEL 1",
            "APROBADO NIVEL 2",
            "APROBADO FINANZAS",
            "RECEPCIONADO",
            "PAGADO",  # AUDITORÍA H-25: estado registrable en histórico (historico_service.ESTADOS_REGISTRABLES)
        }
        
        if estado_upper not in estados_validos:
            raise HTTPException(
                status_code=400,
                detail=f"Estado inválido. Estados válidos: {', '.join(estados_validos)}"
            )
        
        # Obtener registros por estado
        stmt = select(TablaHistorico).where(
            TablaHistorico.estado == estado_upper,
            *(await _condiciones_alcance(current_user, session)),
        ).order_by(
            TablaHistorico.fecha_registro_historico.desc()
        ).limit(limit)
        
        result = await session.execute(stmt)
        historicos = result.scalars().all()
        
        # [DEBUG] logger.debug(f"Se obtuvieron {len(historicos)} registros con estado {estado_upper}")
        return historicos
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al obtener histórico por estado: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener histórico: {str(e)}")


@router.get(
    "/historico/solicitante/{solicitante}",
    tags=["Histórico"],
    response_model=list[HistoricoOut],
    summary="Obtener histórico por solicitante"
)
async def obtener_historico_por_solicitante(
    solicitante: str,
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Obtiene todos los cambios registrados para solicitudes de un solicitante específico.
    
    **Parámetros:**
    - `solicitante`: Nombre o parte del nombre del solicitante
    - `limit`: Cantidad máxima de registros (default: 100)
    
    **Retorna:**
    Lista de registros históricos de ese solicitante
    
    **Ejemplo:**
    ```
    GET /historico/solicitante/Juan
    ```
    """
    try:
        # Buscar con LIKE (insensible a mayúsculas)
        stmt = select(TablaHistorico).where(
            TablaHistorico.solicitante.ilike(f"%{solicitante}%"),
            *(await _condiciones_alcance(current_user, session)),
        ).order_by(
            TablaHistorico.fecha_registro_historico.desc()
        ).limit(limit)
        
        result = await session.execute(stmt)
        historicos = result.scalars().all()
        
        # [DEBUG] logger.debug(f"Se obtuvieron {len(historicos)} registros para solicitante '{solicitante}'")
        return historicos
        
    except Exception as e:
        logger.error(f"Error al obtener histórico por solicitante: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener histórico: {str(e)}")


@router.get(
    "/historico/estadisticas",
    tags=["Histórico"],
    summary="Obtener estadísticas del histórico"
)
async def obtener_estadisticas_historico(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Obtiene estadísticas generales del histórico.
    
    **Retorna:**
    - Total de registros
    - Cantidad por estado
    - Solicitud más activa
    - Última actualización
    
    **Ejemplo:**
    ```
    GET /historico/estadisticas
    ```
    """
    try:
        from sqlalchemy import func
        alcance = await _condiciones_alcance(current_user, session)
        
        # Total de registros
        stmt_total = select(func.count(TablaHistorico.id)).where(*alcance)
        result_total = await session.execute(stmt_total)
        total_registros = result_total.scalar() or 0
        
        # Registros por estado
        stmt_por_estado = select(
            TablaHistorico.estado,
            func.count(TablaHistorico.id).label('cantidad')
        ).where(*alcance).group_by(TablaHistorico.estado)
        result_por_estado = await session.execute(stmt_por_estado)
        por_estado = {row[0]: row[1] for row in result_por_estado.all()}
        
        # Solicitud más activa (más cambios registrados)
        stmt_activa = select(
            TablaHistorico.id_solicitud_origen,
            func.count(TablaHistorico.id).label('cambios')
        ).where(*alcance).group_by(
            TablaHistorico.id_solicitud_origen
        ).order_by(
            func.count(TablaHistorico.id).desc()
        ).limit(1)
        result_activa = await session.execute(stmt_activa)
        activa = result_activa.first()
        
        # Último registro
        stmt_ultimo = select(TablaHistorico).where(*alcance).order_by(
            TablaHistorico.fecha_registro_historico.desc()
        ).limit(1)
        result_ultimo = await session.execute(stmt_ultimo)
        ultimo = result_ultimo.scalar_one_or_none()
        
        estadisticas = {
            "total_registros": total_registros,
            "por_estado": por_estado,
            "solicitud_mas_activa": {
                "id_solicitud": activa[0] if activa else None,
                "cambios_registrados": activa[1] if activa else 0
            } if activa else None,
            "ultimo_cambio": {
                "id_solicitud_origen": ultimo.id_solicitud_origen if ultimo else None,
                "estado": ultimo.estado if ultimo else None,
                "fecha": ultimo.fecha_registro_historico if ultimo else None
            } if ultimo else None
        }
        
        # [DEBUG] logger.debug(f"Estadísticas obtenidas: {total_registros} registros totales")
        return estadisticas
        
    except Exception as e:
        logger.error(f"Error al obtener estadísticas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener estadísticas: {str(e)}")
