"""
Utilidades compartidas por /pdf-firmado/* y /pdf-registro-autorizacion/* (AUDITORÍA H-26).

Problema original: los IDs recibidos se aplicaban a la vez sobre `tabla_todas_solicitudes` y
`tabla_recepcionados`, que tienen secuencias independientes; asociar (o borrar) el PDF de la
solicitud N modificaba también al recepcionado N, un registro sin relación. En el histórico se
filtraba solo por `id_solicitud_origen`, que también colisiona entre ambas tablas.

Solución compatible con el contrato existente:
  - Nuevo parámetro OPCIONAL `origen` = "solicitud" (por defecto) | "recepcionado".
    El frontend (pantallas Aprobaciones y Finanzas) siempre envía IDs de solicitudes, por lo que
    no necesita cambios.
  - Solo se actualiza la tabla de origen.
  - En el histórico se actualizan las filas con el mismo `id_solicitud_origen` Y el mismo folio
    consolidado que el registro de origen (los folios son únicos a nivel global).
"""
import json
from typing import List, Type

from fastapi import HTTPException
from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.tabla_historico import TablaHistorico
from app.domain.models.tabla_recepcionados import Tabla_Recepcionados
from app.domain.models.tabla_todas_solicitudes import Tabla_Todas_Solicitudes

ORIGENES = {"solicitud": Tabla_Todas_Solicitudes, "recepcionado": Tabla_Recepcionados}


def modelo_origen(origen: str | None) -> Type:
    modelo = ORIGENES.get((origen or "solicitud").strip().lower())
    if modelo is None:
        raise HTTPException(status_code=400, detail="Origen inválido. Valores permitidos: solicitud, recepcionado")
    return modelo


def parsear_ids(ids: str) -> List[int]:
    try:
        valores = json.loads(ids)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Formato de IDs inválido (debe ser un JSON array)")
    if not isinstance(valores, list) or not valores:
        raise HTTPException(status_code=400, detail="Se requiere una lista de IDs válida")
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in valores):
        raise HTTPException(status_code=400, detail="Los IDs deben ser números enteros")
    return valores


async def condicion_historico(session: AsyncSession, modelo: Type, ids: List[int]):
    """Filas del histórico que pertenecen a esos registros: mismo id de origen y mismo folio."""
    filas = (await session.execute(select(modelo.id, modelo.folio).where(modelo.id.in_(ids)))).all()
    if not filas:
        return None
    return or_(*[
        and_(TablaHistorico.id_solicitud_origen == f.id, TablaHistorico.folio == f.folio) for f in filas
    ])


async def asignar_campo(session: AsyncSession, modelo: Type, ids: List[int], campo: str, valor,
                        incluir_historico: bool) -> None:
    await session.execute(update(modelo).where(modelo.id.in_(ids)).values(**{campo: valor}))
    if incluir_historico:
        cond = await condicion_historico(session, modelo, ids)
        if cond is not None:
            await session.execute(update(TablaHistorico).where(cond).values(**{campo: valor}))
