from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert
from fastapi import Request, HTTPException, status, Depends
from app.domain.models.tabla_procesos import Procesos
from app.domain.dto.procesosDTO import ProcesosIn
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("procesos_rootes")

async def crear_proceso_service(data: ProcesosIn, session: AsyncSession):

    try:

        # Verificar nombre existente
        result = await session.execute(
            select(Procesos.id).where(Procesos.nombre == data.nombre.upper())
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail= f"El nombre '{data.nombre}' ya está registrado")

        # Inserción estilo Core con RETURNING
        stmt = insert(Procesos).values(
            nombre=data.nombre.upper(),
            proceso=data.proceso.upper(),
            cuenta_objeto=data.cuenta_objeto,
            auxiliar=data.auxiliar,
            estado=data.estado.value
        ).returning(Procesos)

        result = await session.execute(stmt)
        await session.commit()

        return result.scalar_one(), None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al crear proceso: {e}")
        await session.rollback()
        # AUDITORÍA H-12: antes se devolvía str(e) (SQL/driver) al cliente.
        return None, "No se pudo crear el proceso: verifique el largo y formato de los campos."
