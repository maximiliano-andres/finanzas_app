from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert

from app.domain.models.tabla_procesos_auxiliares import ProcesosAuxiliares
from app.domain.dto.procesos_auxiliaresDTO import ProcesosAuxiliaresIn


async def crear_proceso_auxiliar_service(
    data: ProcesosAuxiliaresIn, session: AsyncSession
):
    # 1. Verificar numero existente
    result_num = await session.execute(
        select(ProcesosAuxiliares.id).where(ProcesosAuxiliares.numero == data.numero)
    )
    if result_num.scalar_one_or_none():
        return None, f"Ya existe un proceso auxiliar con el número {data.numero}"

    # 2. Verificar detalle existente
    result_det = await session.execute(
        select(ProcesosAuxiliares.id).where(ProcesosAuxiliares.detalle == data.detalle)
    )
    if result_det.scalar_one_or_none():
        return None, f"Ya existe un proceso auxiliar con el detalle '{data.detalle}'"

    # 3. Verificar auxiliar existente
    result_aux = await session.execute(
        select(ProcesosAuxiliares.id).where(ProcesosAuxiliares.auxiliar == data.auxiliar)
    )
    if result_aux.scalar_one_or_none():
        return None, f"Ya existe un proceso auxiliar con el código auxiliar {data.auxiliar}"

    # Inserción estilo Core con RETURNING
    stmt = (
        insert(ProcesosAuxiliares)
        .values(
            numero=data.numero,
            detalle=data.detalle,
            auxiliar=data.auxiliar,
            estado=data.estado.value,
        )
        .returning(ProcesosAuxiliares)
    )

    result = await session.execute(stmt)
    await session.commit()

    return result.scalar_one(), None
