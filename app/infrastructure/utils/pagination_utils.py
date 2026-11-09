"""
Utilidad de paginación para consultas SQLAlchemy AsyncSession.
Permite aplicar paginación de forma eficiente y consistente en todos los endpoints.
"""
from sqlalchemy import Select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Tuple, Any
import os

from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("PAGINATION")


def _tope_listado() -> int:
    try:
        return max(1, int(os.getenv("LISTADO_MAX_REGISTROS", "10000")))
    except ValueError:
        return 10000


def _ordenar_por_pk(query: Select) -> Select:
    """Ordena por la clave primaria de la entidad principal (orden de inserción, como antes en la práctica)."""
    desc = query.column_descriptions[0] if query.column_descriptions else {}
    entity = desc.get("entity")
    if entity is not None and hasattr(entity, "__table__"):
        return query.order_by(*entity.__table__.primary_key.columns)
    return query


async def paginate_query(
    query: Select,
    session: AsyncSession,
    limit: int | None = None,
    offset: int | None = None,
    default_limit: int = 50,
    max_limit: int = 200
) -> Tuple[List[Any], int]:
    """
    Aplica paginación a una query SQLAlchemy de forma eficiente.
    
    Args:
        query: Query SQLAlchemy Select
        session: AsyncSession de SQLAlchemy
        limit: Cantidad de registros a retornar (opcional)
        offset: Cantidad de registros a saltar (opcional)
        default_limit: Límite por defecto cuando se especifica offset pero no limit
        max_limit: Límite máximo permitido
    
    Returns:
        Tuple con (lista de resultados paginados, total de registros)
    
    Comportamiento:
        - Si limit y offset son None: retorna TODOS los registros (sin paginación, comportamiento actual)
        - Si se especifica limit o offset: aplica paginación con el límite especificado
        - Valida que limit no exceda max_limit
    """
    # AUDITORÍA H-13: LIMIT/OFFSET negativos llegaban a PostgreSQL y producían un 500 genérico.
    if (limit is not None and limit < 0) or (offset is not None and offset < 0):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Los parámetros limit y offset deben ser mayores o iguales a 0")

    # Comportamiento sin paginación: retorna TODOS los registros (contrato que usa el frontend, que no pagina).
    # AUDITORÍA H-04: antes se aplicaba max_limit (200/500) en silencio y sin ORDER BY, por lo que con más
    # registros desaparecían filas arbitrarias de las bandejas. Ahora:
    #   - orden determinista por clave primaria cuando la consulta no define uno;
    #   - tope de seguridad alto y configurable (LISTADO_MAX_REGISTROS, por defecto 10000) que, si se alcanza,
    #     se registra como advertencia en lugar de truncar silenciosamente.
    if limit is None and offset is None:
        tope = _tope_listado()
        ordered = query if query._order_by_clauses else _ordenar_por_pk(query)
        result = await session.execute(ordered.limit(tope + 1))
        records = list(result.unique().scalars().all())
        if len(records) > tope:
            logger.warning(f"Listado sin paginación supera el tope de {tope} registros; se truncó. "
                           "Use limit/offset o aumente LISTADO_MAX_REGISTROS.")
            records = records[:tope]
        return records, len(records)

    # Aplicar paginación cuando se solicita explícitamente
    # Si solo se especifica offset, usar limite por defecto
    if limit is None:
        limit = default_limit
    
    # Validar límite máximo
    if limit > max_limit:
        limit = max_limit
    
    # Obtener el total de registros (para información del cliente)
    count_query = query.with_only_columns(func.count()).order_by(None)
    count_result = await session.execute(count_query)
    total_count = count_result.scalar() or 0
    
    # Aplicar limit y offset
    offset = offset if offset is not None else 0
    paginated_query = query.limit(limit).offset(offset)
    
    # Ejecutar query paginada
    result = await session.execute(paginated_query)
    records = list(result.unique().scalars().all())
    
    return records, total_count
