import secrets
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert
from app.infrastructure.security.hashing import hash_password

from app.domain.models.tabla_usuarios import Usuarios
from app.domain.dto.usuariosDTO import UsuariosIn
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("USUARIO_SERVICE")


def generar_password_temporal() -> str:
    """
    Genera una contraseña temporal criptográficamente segura de un solo uso.
    Formato: 4 chars-4 chars-4 chars (hex + letras mayúsculas para legibilidad).
    Ejemplo: 3aF9-c12B-87eD
    """
    parte1 = secrets.token_hex(2)  # 4 chars hex sin guiones
    parte2 = secrets.token_hex(2)
    parte3 = secrets.token_hex(2)
    return f"{parte1}-{parte2}-{parte3}"


async def crear_usuario_service(data: UsuariosIn, session: AsyncSession):
    # Verificar email existente (Uso de Core select)
    result = await session.execute(
        select(Usuarios.id).where(Usuarios.email == data.email)
    )
    if result.scalar_one_or_none():
        return None, None, "El email ya está registrado"

    # Verificar RUT existente
    result_rut = await session.execute(
        select(Usuarios.id).where(Usuarios.rut == data.rut)
    )
    if result_rut.scalar_one_or_none():
        return None, None, "El RUT ya está registrado"

    # Generar contraseña temporal segura (el administrador nunca la conoce)
    temp_password = generar_password_temporal()
    hashed_password = hash_password(temp_password)

    # Inserción estilo Core con RETURNING
    # must_change_password=True: fuerza al usuario a cambiar la clave en su primer acceso
    stmt = insert(Usuarios).values(
        cargo=data.cargo,
        nombre_1=data.nombre_1,
        nombres_2=data.nombres_2,
        apellido_1=data.apellido_1,
        apellido_2=data.apellido_2,
        email=data.email,
        hashed_password=hashed_password,
        rol_id=data.rol_id,
        rut=data.rut,
        must_change_password=True,  # <-- SEGURIDAD: obliga cambio en primer ingreso
    ).returning(Usuarios)

    result = await session.execute(stmt)
    await session.flush()
    usuario_creado = result.scalar_one()

    # Si hay obras asociadas, se insertan en la tabla intermedia
    if hasattr(data, 'obras_ids') and data.obras_ids:
        from app.domain.models.tabla_usuarios_obras import UsuariosObras
        obras_values = [{"usuario_id": usuario_creado.id, "obra_id": obra_id} for obra_id in data.obras_ids]
        await session.execute(insert(UsuariosObras).values(obras_values))

    await session.commit()

    # Envío de correo movido al frontend; se enviará cuando el administrador presione el botón.
    # Mantener la lógica para posibles usos futuros sin ejecutar envío automático.

    return usuario_creado, temp_password, None
