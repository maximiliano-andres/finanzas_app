from fastapi import APIRouter, Request, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path
from typing import List, Optional
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.utils.pdf_utils import optimizar_y_guardar_pdf, eliminar_pdf
from app.infrastructure.utils.response_wrapper import success_response, error_response
from app.infrastructure.db.database import get_db
from app.domain.models.tabla_recepcionados import Tabla_Recepcionados
from app.domain.dto.recepcionadoDTO import RecepcionadoOut, RecepcionadoIn, RecepcionadoUpdate
from app.domain.services.recepcionado_service import  crear_recepcionado_service , actualizar_recepcionado_service, convertir_recepcionado_a_solicitud
from app.infrastructure.security.auth_token_roles import get_current_user #requiere token
from app.infrastructure.security.permisos import puede_recepcionar, puede_gestionar_recepcionado
from app.domain.models.tabla_todas_solicitudes import Tabla_Todas_Solicitudes
from app.domain.dto.todas_solicitudesDTO import Todas_SolicitudesOut, Todas_SolicitudesIn
from sqlalchemy import insert

logger = setup_logger("RECEPCIONADO ROUTES")

# Crear el router   
router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

SELECT_RECEPCIONADO = select(Tabla_Recepcionados)


async def _autorizar_recepcionado(id: int, current_user: dict, session: AsyncSession) -> None:
    """403 si el usuario no puede gestionar el recepcionado (inexistente: lo resuelve el servicio)."""
    recepcionado = await session.get(Tabla_Recepcionados, id)
    if recepcionado and not await puede_gestionar_recepcionado(session, current_user, recepcionado):
        raise HTTPException(status_code=403, detail="No tiene permisos para modificar este registro")

#Ruta para obtener todas las recepcionados
@router.get("/recepcionado", tags=["Recepcionado"], response_model=list[RecepcionadoOut])
async def obtener_recepcionado(
    request: Request,
    limit: int | None = None,
    offset: int | None = None,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    # Aplicar filtros de seguridad si no es administrador
    user_id = int(current_user.get("sub"))
    
    # Reconstrucción de nombre completo para coincidir con el campo solicitante (incluso con dobles espacios)
    full_name_parts = [
        current_user.get("primer_nombre", ""),
        current_user.get("segundo_nombre", ""),
        current_user.get("primer_apellido", ""),
        current_user.get("segundo_apellido", "")
    ]
    # Reconstrucción exacta del formato con posibles dobles espacios si faltan nombres
    user_name_full = " ".join(str(part) if part else "" for part in full_name_parts).strip()
    # Versión normalizada sin dobles espacios para fallback
    user_name_normalized = " ".join(filter(None, [str(p) for p in full_name_parts])).strip()

    role = current_user.get("rol_nombre")
    cargo = current_user.get("cargo")

    from app.infrastructure.utils.pagination_utils import paginate_query
    
    query = SELECT_RECEPCIONADO
    if (role not in ["Administrador", "Supervisor", "Responsable Finanzas"] and 
        cargo not in ["Jefe de Recursos Humanos", "Subgerente de Capital Humano", "Jefe de Finanzas"]):
        from sqlalchemy import or_, and_, false
        
        # 1. Obtener obras permitidas para filtrar
        from app.domain.models.tabla_usuarios_obras import UsuariosObras
        from app.domain.models.tabla_procesos_auxiliares import ProcesosAuxiliares
        
        obras_usuario = await session.execute(
            select(ProcesosAuxiliares.detalle)
            .join(UsuariosObras, ProcesosAuxiliares.id == UsuariosObras.obra_id)
            .where(UsuariosObras.usuario_id == user_id)
        )
        obras_permitidas = obras_usuario.scalars().all()

        # Condición de identidad robusta (ID o nombres completos)
        # AUDITORÍA H-06: por usuario_id, o por nombre salvo homónimos con usuario_id propio.
        from app.infrastructure.security.permisos import condicion_propiedad
        condicion_identidad = condicion_propiedad(Tabla_Recepcionados, current_user)

        if role == "Solicitante":
            # REGLA: Solicitantes ven sus propias solicitudes pero NO las pagadas
            from sqlalchemy import not_
            filtros_base = and_(condicion_identidad, Tabla_Recepcionados.estado != "PAGADO")
            
            if obras_permitidas:
                query = query.where(and_(filtros_base, Tabla_Recepcionados.obra.in_(obras_permitidas)))
            else:
                query = query.where(false())
        else:
            # Otros roles (RRHH, Finanzas sin cargo alto) requieren permisos por obra
            if obras_permitidas:
                query = query.where(Tabla_Recepcionados.obra.in_(obras_permitidas))
            else:
                query = query.where(false())

    recepcionados, total_count = await paginate_query(
        query,
        session,
        limit=limit,
        offset=offset
    )
    
    # [DEBUG] logger.debug(f"Recepcionados retornados: {len(recepcionados)}/{total_count}")
    return recepcionados


#Ruta para crear una nueva recepcionado
@router.post("/recepcionado", tags=["Recepcionado"], response_model=RecepcionadoOut)
async def crear_recepcionado(
    request: Request, 
    data: RecepcionadoIn, 
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)):
    
    """Crear una nueva solicitud"""
    # AUDITORÍA H-01b: recepcionar es exclusivo de la pantalla Finanzas (Administrador / Finanzas).
    # Antes cualquier usuario autenticado podía crear un recepcionado (incluso PAGADO con pdf_firmado).
    if not puede_recepcionar(current_user):
        raise HTTPException(status_code=403, detail="No tiene permisos para recepcionar solicitudes")

    # AUDITORÍA H-23: el recepcionado pertenece al dueño de la solicitud de origen (no a quien recepciona);
    # si no hay origen identificable se mantiene el comportamiento previo (usuario actual).
    origen = None
    if data.id_solicitud_origen:
        origen = await session.get(Tabla_Todas_Solicitudes, data.id_solicitud_origen)
    data.usuario_id = origen.usuario_id if origen and origen.usuario_id else int(current_user.get("sub"))
    
    recepcionado, error = await crear_recepcionado_service(data, session)
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    return recepcionado
    

#Ruta para actualizar recepcionados
@router.patch("/recepcionado/{id}", tags=["Recepcionado"], response_model=RecepcionadoOut)
async def actualizar_recepcionado(
    id: int,
    data: RecepcionadoUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    # Validar propiedad del recurso si no es administrador
    user_id = int(current_user.get("sub"))
    user_name = current_user.get("nombre") or current_user.get("primer_nombre")
    role = current_user.get("rol_nombre")

    if role not in ["Administrador", "Supervisor"]:
        solicitud = await session.get(Tabla_Recepcionados, id)
        if not solicitud:
            raise HTTPException(status_code=404, detail="Recepcionado no encontrado")
        
        if solicitud.usuario_id != user_id and solicitud.solicitante != user_name:
            raise HTTPException(status_code=403, detail="No tiene permisos para modificar este registro")

    # REGLA DE NEGOCIO: No sobrescribir usuario_id ni solicitante durante la actualización
    payload = data.model_dump(exclude_unset=True)

    """Actualizar una solicitud existente"""
    recepcionado, error = await actualizar_recepcionado_service(id, payload, session)
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    return recepcionado


# Ruta para guardar cambios de recepcionado como nueva solicitud
@router.post("/recepcionado/{id}/guardar-como-solicitud", tags=["Recepcionado"])
async def guardar_recepcionado_como_solicitud(
    id: int,
    data: RecepcionadoUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Convierte un recepcionado modificado en una nueva solicitud en 'Mis Solicitudes'.
    - Inserta los cambios como nueva solicitud con tipo_solicitud = 'Recepcionado'
    - Elimina el recepcionado original
    - La solicitud reinicia el flujo de validación (estado = 'PENDIENTE', reviso = 'Jefe de Recursos Humanos')
    """
    # AUDITORÍA H-07b: antes cualquier usuario convertía (y eliminaba) recepcionados ajenos.
    await _autorizar_recepcionado(id, current_user, session)

    payload = data.model_dump(exclude_unset=True, exclude_none=False)
    # NO sobrescribir usuario_id aquí. 
    # Al no pasar usuario_id en el payload, el servicio preservará el usuario_id original 
    # del registro Tabla_Recepcionados (o usará el que envíe el cliente si viene explícitamente).
    
    nueva_solicitud_id, error = await convertir_recepcionado_a_solicitud(id, payload, session)
    
    if error:
        logger.error(f"Error al convertir recepcionado {id}: {error}")
        raise HTTPException(status_code=400, detail=error)
    
    logger.info(f"Recepcionado {id} convertido exitosamente a solicitud {nueva_solicitud_id}")
    
    return {
        "status": "success",
        "message": "El recepcionado ha sido guardado como nueva solicitud y reenviado al flujo de validación",
        "nueva_solicitud_id": nueva_solicitud_id,
        "recepcionado_eliminado": id
    }


# Ruta para modificar y reenviar una solicitud (Transaccional)
@router.post("/recepcionado/{id}/reenviar", tags=["Recepcionado"], response_model=Todas_SolicitudesOut)
async def reenviar_recepcionado(
    id: int,
    data: Todas_SolicitudesIn,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Mueve una solicitud de Recepcionado a Todas las Solicitudes (activa).
    Operación atómica: Elimina de recepcionado -> Inserta en Todas las Solicitudes.
    Mantiene el Folio original.
    """
    # 1. Buscar y eliminar de Recepcionado
    recepcionado = await session.get(Tabla_Recepcionados, id)
    if not recepcionado:
        raise HTTPException(status_code=404, detail="Solicitud de recepcionado no encontrada")
    if not await puede_gestionar_recepcionado(session, current_user, recepcionado):  # AUDITORÍA H-07b
        raise HTTPException(status_code=403, detail="No tiene permisos para modificar este registro")
    
    # Validar que el folio coincida (seguridad extra)
    if recepcionado.folio != data.folio:
        raise HTTPException(status_code=400, detail="El folio no coincide con el registro original")

    await session.delete(recepcionado)
    # FLUSH para liberar el unique constraint del folio antes de insertar
    await session.flush() 

    # 2. Insertar en Todas las Solicitudes
    # Asegurar estado y etapa inicial
    nuevo_registro_dict = data.model_dump()
    nuevo_registro_dict['estado'] = 'RECHAZADO'
    nuevo_registro_dict['reviso'] = 'Jefe de Recursos Humanos' # Etapa inicial
    nuevo_registro_dict['tipo_solicitud'] = 'Recepcionado' # Regla de negocio: Modificación desde recepcionado = Recepcionado
    nuevo_registro_dict['usuario_id'] = recepcionado.usuario_id
    nuevo_registro_dict['solicitante'] = recepcionado.solicitante
    # Asegurar fechas correctas si vienen como string
    
    stmt = insert(Tabla_Todas_Solicitudes).values(**nuevo_registro_dict).returning(Tabla_Todas_Solicitudes)
    
    try:
        result = await session.execute(stmt)
        nueva_solicitud = result.scalar_one()
        await session.commit()
        return nueva_solicitud
    except Exception as e:
        await session.rollback()
        logger.error(f"Error en transacción reenviar_recepcionado: {str(e)}")
        # AUDITORÍA H-12: no exponer el error del driver (SQL) al cliente.
        raise HTTPException(status_code=400, detail="Error al procesar la solicitud: datos inválidos para el registro.")

# Ruta para agregar un PDF a un campo específico de recepcionado
@router.post("/recepcionado/{id}/pdf", tags=["Recepcionado"])
async def agregar_pdf_a_recepcionado(
    id: int,
    field_name: str = Form(...),
    pdf: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Agregar un PDF a un folio específico de un registro de recepcionado"""
    
    # Validar que el archivo sea PDF
    if pdf.content_type != 'application/pdf':
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")
    
    # Obtener el registro de recepcionado
    recepcionado = await session.get(Tabla_Recepcionados, id)
    if not recepcionado:
        raise HTTPException(status_code=404, detail="Registro de recepcionado no encontrado")
    if not await puede_gestionar_recepcionado(session, current_user, recepcionado):  # AUDITORÍA H-07b
        raise HTTPException(status_code=403, detail="No tiene permisos para modificar este registro")
        
    # Validar que el nombre del campo sea válido
    valid_fields = ["pdf_folio_uno", "pdf_folio_dos", "pdf_folio_tres", "pdf_folio_cuatro", "pdf_folio_cinco"]
    if field_name not in valid_fields:
        raise HTTPException(status_code=400, detail=f"Campo PDF inválido. Debe ser uno de: {', '.join(valid_fields)}")

    try:
        # Procesar y guardar el PDF
        content = await pdf.read()
        
        # Obtener el folio correspondiente para el nombre del archivo
        # Ejemplo: si field_name es pdf_folio_dos, buscamos el valor en folio_dos
        folio_suffix = field_name.replace("pdf_", "") # folio_uno, folio_dos...
        folio_val = getattr(recepcionado, folio_suffix) or "folio_extra"
        
        pdf_path = await optimizar_y_guardar_pdf(content, pdf.filename, str(folio_val))
        
        # Guardar en la base de datos
        setattr(recepcionado, field_name, pdf_path)
        
        await session.commit()
        await session.refresh(recepcionado)
        
        logger.info(f"PDF agregado exitosamente a recepcionado {id}, campo {field_name}: {pdf_path}")
        
        return {
            "status": "success",
            "message": f"PDF agregado exitosamente a {field_name}",
            "pdf_path": pdf_path
        }
        
    except Exception as e:
        logger.error(f"Error al agregar PDF a recepcionado {id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al procesar el PDF: {str(e)}")


@router.delete("/recepcionado/{id}/pdf", tags=["Recepcionado"])
async def eliminar_pdf_de_recepcionado(
    id: int,
    field_name: str,
    pdf_path: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Eliminar un PDF de un campo específico y del almacenamiento"""
    
    # Obtener el registro de recepcionado
    recepcionado = await session.get(Tabla_Recepcionados, id)
    if not recepcionado:
        raise HTTPException(status_code=404, detail="Registro de recepcionado no encontrado")
    if not await puede_gestionar_recepcionado(session, current_user, recepcionado):  # AUDITORÍA H-07b
        raise HTTPException(status_code=403, detail="No tiene permisos para modificar este registro")
    
    # Validar que el nombre del campo sea válido
    valid_fields = ["pdf_folio_uno", "pdf_folio_dos", "pdf_folio_tres", "pdf_folio_cuatro", "pdf_folio_cinco"]
    if field_name not in valid_fields:
        raise HTTPException(status_code=400, detail="Campo PDF inválido")

    # Verificar si el campo coincide con la ruta proporcionada (Normalizando para evitar fallos por slashes)
    current_path = getattr(recepcionado, field_name)
    if not current_path or Path(current_path).as_posix() != Path(pdf_path).as_posix():
        logger.warning(f"Intento de eliminar PDF con ruta no coincidente. DB: {current_path}, Recibido: {pdf_path}")
        raise HTTPException(status_code=400, detail="La ruta del PDF no coincide con el registro")

    try:
        # 1. Eliminar de la base de datos PRIMERO
        setattr(recepcionado, field_name, None)
        await session.commit() # Asegurar que la DB se actualiza
        
        # 2. Eliminar del almacenamiento físico
        await eliminar_pdf(pdf_path)
        
        await session.refresh(recepcionado)
        
        logger.info(f"PDF eliminado exitosamente de recepcionado {id}, campo {field_name}: {pdf_path}")
        
        return {
            "status": "success",
            "message": "PDF eliminado exitosamente"
        }
        
    except Exception as e:
        logger.error(f"Error al eliminar PDF de recepcionado {id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar el PDF: {str(e)}")

