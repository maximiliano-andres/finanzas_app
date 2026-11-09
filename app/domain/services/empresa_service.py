from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError


from app.domain.models.tabla_empresas import Empresas
from app.domain.dto.empresasDTO import EmpresasIn


async def crear_empresa_service(data: EmpresasIn, session: AsyncSession):

    # Verificar nombre existente
    result = await session.execute(
        select(Empresas.id).where(Empresas.empresa == data.empresa.upper())
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail= f"El nombre de la empresa '{data.empresa}' ya está registrado")

    # Inserción estilo Core con RETURNING
    stmt = insert(Empresas).values(
        empresa=data.empresa.upper(),
        codigo=data.codigo
    ).returning(Empresas)

    try:
        result = await session.execute(stmt)
        await session.commit()
    except IntegrityError:
        # AUDITORÍA H-11: solo se validaba el nombre; el código duplicado (UNIQUE) terminaba en 500 genérico.
        await session.rollback()
        raise HTTPException(status_code=400, detail=f"El código de empresa '{data.codigo}' ya está registrado")

    return result.scalar_one(), None
