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
from datetime import date
logger = setup_logger("TODAS SOLICITUDES ROUTES")
from app.infrastructure.db.database import get_db
from app.domain.models.tabla_todas_solicitudes import Tabla_Todas_Solicitudes
from app.domain.dto.todas_solicitudesDTO import Todas_SolicitudesOut, Todas_SolicitudesIn, Todas_SolicitudesUpdate
from app.domain.services.todas_solicitudes import crear_todas_solicitudes_service, actualizar_todas_solicitudes_service
from app.infrastructure.security.auth_token_roles import get_current_user #requiere token
from app.infrastructure.security.permisos import (
    ESTADOS_INICIALES_SOLICITANTE,
    coincide_nombre,
    condicion_propiedad,
    crea_sin_restriccion,
    es_dueno_verificado,
    nombres_usuario,
    puede_modificar_solicitud,
    transicion_permitida_para_dueno,
)
from app.domain.models.tabla_recepcionados import Tabla_Recepcionados

logger = setup_logger("TODAS SOLICITUDES ROUTES")

# Crear el router
router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

SELECT_TODAS_SOLICITUDES = select(Tabla_Todas_Solicitudes)

@router.get("/todas_solicitudes", tags=["Todas las solicitudes"], response_model=list[Todas_SolicitudesOut])
async def obtener_todas_solicitudes(
    request: Request,
    limit: int | None = None,
    offset: int | None = None,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Obtener todas las solicitudes desde la base de datos con soporte de paginación opcional"""
    from app.infrastructure.utils.pagination_utils import paginate_query
    
    # Aplicar filtros de seguridad si el usuario no es Admin/Supervisor
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

    query = SELECT_TODAS_SOLICITUDES
    # Bypass de seguridad para roles administrativos y Jefe de Finanzas para que pueda ver todo
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
        # AUDITORÍA H-06: por usuario_id, o por nombre salvo homónimos con usuario_id propio.
        condicion_usuario = condicion_propiedad(Tabla_Todas_Solicitudes, current_user)
        if obras_permitidas:
            query = query.where(and_(condicion_usuario, Tabla_Todas_Solicitudes.obra.in_(obras_permitidas)))
        else:
            query = query.where(false())

    todas_solicitudes, total_count = await paginate_query(
        query,
        session,
        limit=limit,
        offset=offset
    )
    
    # [DEBUG] logger.debug(f"Solicitudes retornadas: {len(todas_solicitudes)}/{total_count}")
    return todas_solicitudes


@router.post("/todas_solicitudes", tags=["Todas las solicitudes"])

#MOver esta funcion mas adelante para ordenar mejor el codigo
async def crear_todas_solicitudes(
    solicitante: str = Form(...),
    fecha_solicitud: date = Form(...),
    folio: List[str] = Form(...), # Siempre se recibe como lista
    montos_por_folio: List[float] = Form(default=[]), # Corresponde a folios_monto[]
    empresa: str = Form(...),
    obra: str = Form(...), # Nuevo campo
    proceso: str = Form(...),
    monto: float = Form(...),
    reviso: str = Form(...),
    mes_de_proceso: str = Form(...),
    anio: int = Form(...),
    cuenta_contable: str = Form(...),
    auxiliar: str = Form(...),
    fecha_de_pago: date = Form(...),
    unidad_de_negocio: str = Form(...),
    glosa: Optional[str] = Form(None),
    observaciones: Optional[str] = Form(None),
    estado: Optional[str] = Form(None),
    forma_pago: List[str] = Form(default=[]),
    pdfs: List[UploadFile] = File([]),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Crear una nueva solicitud con soporte para múltiples folios y sus respectivos PDFs"""
    logger.info(f"Iniciando creación de solicitud. Folios: {folio}, Formas Pago: {forma_pago}, Estado: {estado}")
    
    # Validar acceso a la Unidad de Negocio
    role = current_user.get("rol_nombre")
    if role not in ["Administrador", "Supervisor", "Responsable Finanzas"] and current_user.get("cargo") not in ["Jefe de Finanzas", "Jefe de Recursos Humanos"]:
        from app.domain.models.tabla_usuarios_obras import UsuariosObras
        from app.domain.models.tabla_procesos_auxiliares import ProcesosAuxiliares
        user_id_check = int(current_user.get("sub"))
        obras_usuario = await session.execute(
            select(ProcesosAuxiliares.detalle)
            .join(UsuariosObras, ProcesosAuxiliares.id == UsuariosObras.obra_id)
            .where(UsuariosObras.usuario_id == user_id_check)
        )
        obras_permitidas = obras_usuario.scalars().all()
        if not obras_permitidas or obra not in obras_permitidas:
            raise HTTPException(status_code=403, detail="No tiene permisos para crear una solicitud en esta Unidad de Negocio / Obra")

    # AUDITORÍA H-06: un usuario sin rol de gestión solo registra solicitudes a su propio nombre. El frontend
    # ya envía el nombre de la sesión; si llega otro, se reemplaza por el del token (no se rechaza).
    if not crea_sin_restriccion(current_user) and not coincide_nombre(current_user, solicitante):
        logger.warning(f"Solicitante '{solicitante}' no coincide con el usuario {current_user.get('sub')}; se usa el nombre de la sesión.")
        solicitante = nombres_usuario(current_user)[0]

    # AUDITORÍA H-02: el estado inicial lo envía el cliente. Un usuario sin rol de gestión solo puede crear
    # en los estados iniciales del flujo (el frontend envía ESPERANDO); antes podía crear directamente "PAGADO".
    if not crea_sin_restriccion(current_user) and (estado or "PENDIENTE").upper() not in ESTADOS_INICIALES_SOLICITANTE:
        raise HTTPException(status_code=403, detail="No tiene permisos para crear una solicitud en ese estado")

    # Asegurar que folios sea una lista
    folios_list = folio if isinstance(folio, list) else [folio]
    
    # Diccionario para mapear folio -> path del PDF
    mapping_pdf = {}
    
    # Procesar y optimizar PDFs
    pdf_paths_all = [] # Para el campo 'pdf' general (JSON)
    
    for pdf_file in pdfs:
        content = await pdf_file.read()
        if not content:
            continue
            
        # Intentar identificar a qué folio pertenece por el nombre del archivo (prefijo)
        # El frontend debe enviar archivos con nombre "FOLIO_nombreoriginal.pdf"
        filename = pdf_file.filename
        target_folio = None
        
        for f in folios_list:
            if filename.startswith(f"{f}_"):
                target_folio = f
                break
        
        # Si no se encuentra prefijo, usamos el primer folio como fallback para el nombre del archivo guardado
        # pero no lo asociamos específicamente a un campo pdf_folio_X a menos que haya coincidencia
        folio_for_filename = target_folio if target_folio else folios_list[0]
        path = await optimizar_y_guardar_pdf(content, filename, folio_for_filename)
        pdf_paths_all.append(path)
        
        if target_folio:
            mapping_pdf[target_folio] = path
            # [DEBUG] logger.debug(f"PDF asocidado a folio {target_folio}: {path}")
        else:
            logger.warning(f"No se pudo asociar el PDF {filename} a ningún folio.")

    # Preparar el diccionario para el DTO con los campos específicos
    data_dict = {
        "usuario_id": int(current_user.get("sub")),
        "solicitante": solicitante,
        "fecha_solicitud": fecha_solicitud,
        "folio": folios_list, # Se guarda como lista en el DTO
        "empresa": empresa,
        "obra": obra,
        "proceso": proceso,
        "monto": monto,
        "estado": estado or "PENDIENTE",
        "reviso": reviso,
        "mes_de_proceso": mes_de_proceso,
        "anio": anio,
        "cuenta_contable": cuenta_contable,
        "auxiliar": auxiliar,
        "fecha_de_pago": fecha_de_pago,
        "unidad_de_negocio": unidad_de_negocio,
        "glosa": glosa,
        "observaciones": observaciones
    }
    

    # Validar que la cantidad de montos coincida con la de folios
    #if montos_por_folio and len(montos_por_folio) != len(folios_list):
     #   raise HTTPException(status_code=400, detail=f"La cantidad de montos por folio ({len(montos_por_folio)}) no coincide con la cantidad de folios ({len(folios_list)}). Debe ingresar un monto para cada folio.")

    suffix_map = {0: "uno", 1: "dos", 2: "tres", 3: "cuatro", 4: "cinco"}
    for i in range(min(len(folios_list), 5)):
        suffix = suffix_map[i]
        f_val = folios_list[i]
        data_dict[f"folio_{suffix}"] = f_val
        # Asignar monto aunque sea None
        monto_val = montos_por_folio[i] if i < len(montos_por_folio) else None
        data_dict[f"monto_por_folio_{suffix}"] = monto_val
        # Asignar PDF aunque sea None
        pdf_val = mapping_pdf.get(f_val, None)
        
        # Fallback: si hay solo un folio y solo un PDF guardado, asociarlos si no hubo match por prefijo
        if not pdf_val and len(folios_list) == 1 and pdf_paths_all:
            pdf_val = pdf_paths_all[0]
            # [DEBUG] logger.debug(f"Asociando PDF por fallback (único folio/PDF): {pdf_val}")
            
        data_dict[f"pdf_folio_{suffix}"] = pdf_val
        # Asignar Forma de Pago
        fp_val = forma_pago[i] if i < len(forma_pago) else None
        data_dict[f"forma_pago_folio_{suffix}"] = fp_val

    async def _descartar_pdfs_guardados():
        # AUDITORÍA H-18: los PDFs se guardan antes de validar; si la solicitud se rechaza no deben quedar huérfanos.
        for p in pdf_paths_all:
            await eliminar_pdf(p)

    try:
        data_dto = Todas_SolicitudesIn(**data_dict)
    except Exception as e:
        logger.error(f"Error validando DTO: {str(e)}")
        await _descartar_pdfs_guardados()
        raise HTTPException(status_code=400, detail=f"Validación fallida: {str(e)}")

    todas_solicitudes, error = await crear_todas_solicitudes_service(data_dto, session)
    if error:
        await _descartar_pdfs_guardados()
        raise HTTPException(status_code=400, detail=error)

    return Todas_SolicitudesOut.model_validate(todas_solicitudes)
    

@router.patch("/todas_solicitudes/{id}", tags=["Todas las solicitudes"], response_model=Todas_SolicitudesOut)
async def actualizar_todas_solicitudes(
    id: int,
    data: Todas_SolicitudesUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    # Validar propiedad del recurso si no es administrador
    user_id = int(current_user.get("sub"))
    user_name = current_user.get("nombre") or current_user.get("primer_nombre")
    role = current_user.get("rol_nombre")

    if role not in ["Administrador", "Supervisor", "Responsable Finanzas","Aprobador"] and current_user.get("cargo") not in ["Jefe de Finanzas"]:
        solicitud = await session.get(Tabla_Todas_Solicitudes, id)
        if not solicitud:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        
        # Reconstrucción de nombre completo idéntica a obtener_todas_solicitudes
        full_name_parts = [
            current_user.get("primer_nombre", ""),
            current_user.get("segundo_nombre", ""),
            current_user.get("primer_apellido", ""),
            current_user.get("segundo_apellido", "")
        ]
        user_name_full = " ".join(str(part) if part else "" for part in full_name_parts).strip()
        user_name_normalized = " ".join(filter(None, [str(p) for p in full_name_parts])).strip()

        # Validar por ID o por nombre robusto (retrocompatibilidad y consistencia)
        # AUDITORÍA H-06: la coincidencia por nombre no otorga control sobre registros de un homónimo.
        if not await es_dueno_verificado(session, current_user, solicitud):
            raise HTTPException(status_code=403, detail="No tiene permisos para modificar esta solicitud")

        # AUDITORÍA H-01: el dueño solo puede ejecutar las transiciones que el frontend le ofrece
        # (enviar/reenviar y "modificar y reenviar"); aprobar niveles, finanzas, recepción o pago es del flujo.
        if data.estado is not None and not transicion_permitida_para_dueno(solicitud, data.estado.value):
            raise HTTPException(status_code=403, detail="No tiene permisos para cambiar la solicitud a ese estado")

    # Actualizar la solicitud en la base de datos
    payload = data.model_dump(exclude_unset=True)
    # REGLA DE NEGOCIO: No sobrescribir usuario_id ni solicitante durante la actualización
    updated_solicitud, error = await actualizar_todas_solicitudes_service(id, payload, session)
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    return updated_solicitud


@router.post("/todas_solicitudes/{id}/pdf", tags=["Todas las solicitudes"])
async def agregar_pdf_a_solicitud(
    id: int,
    field_name: str = Form(...),
    pdf: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Agregar un PDF individual a una solicitud existente en un campo específico"""
    
    # Validar que el archivo sea PDF
    if pdf.content_type != 'application/pdf':
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")
    
    # Obtener la solicitud
    solicitud = await session.get(Tabla_Todas_Solicitudes, id)
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # AUDITORÍA H-07: misma autorización que PATCH (antes cualquier usuario reemplazaba respaldos ajenos).
    if not await puede_modificar_solicitud(session, current_user, solicitud):
        raise HTTPException(status_code=403, detail="No tiene permisos para modificar esta solicitud")

    try:
        # Validar que el nombre del campo sea válido
        valid_fields = ["pdf_folio_uno", "pdf_folio_dos", "pdf_folio_tres", "pdf_folio_cuatro", "pdf_folio_cinco"]
        if field_name not in valid_fields:
            raise HTTPException(status_code=400, detail=f"Campo PDF inválido. Debe ser uno de: {', '.join(valid_fields)}")

        # Procesar y guardar el PDF
        content = await pdf.read()
        
        # Determinar folio para el nombre del archivo
        folio_suffix = field_name.replace("pdf_", "") # folio_uno, folio_dos...
        folio_val = getattr(solicitud, folio_suffix) or "folio_extra"
        
        pdf_path = await optimizar_y_guardar_pdf(content, pdf.filename, str(folio_val))
        
        # Guardar en el campo solicitado
        setattr(solicitud, field_name, pdf_path)
        
        await session.commit()
        await session.refresh(solicitud)
        
        logger.info(f"PDF agregado exitosamente a solicitud {id}: {pdf_path}")
        
        return {
            "status": "success",
            "message": "PDF agregado exitosamente",
            "pdf_path": pdf_path
        }

    except HTTPException:
        # AUDITORÍA H-22: el 400 de campo inválido se capturaba abajo y salía como 500.
        raise
    except Exception as e:
        logger.error(f"Error al agregar PDF a solicitud {id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al procesar el PDF: {str(e)}")


@router.delete("/todas_solicitudes/{id}/pdf", tags=["Todas las solicitudes"])
async def eliminar_pdf_de_solicitud(
    id: int,
    field_name: str,
    pdf_path: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Eliminar un PDF específico de un campo de una solicitud existente"""
    
    # Obtener la solicitud
    solicitud = await session.get(Tabla_Todas_Solicitudes, id)
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # AUDITORÍA H-07: misma autorización que PATCH (antes cualquier usuario borraba respaldos ajenos).
    if not await puede_modificar_solicitud(session, current_user, solicitud):
        raise HTTPException(status_code=403, detail="No tiene permisos para modificar esta solicitud")

    # Verificar si tiene algún PDF en los campos específicos
    has_any_pdf = any([
        solicitud.pdf_folio_uno, solicitud.pdf_folio_dos, 
        solicitud.pdf_folio_tres, solicitud.pdf_folio_cuatro, 
        solicitud.pdf_folio_cinco
    ])
    if not has_any_pdf:
        raise HTTPException(status_code=404, detail="La solicitud no tiene PDFs")
    
    try:
        # Validar que el nombre del campo sea válido
        valid_fields = ["pdf_folio_uno", "pdf_folio_dos", "pdf_folio_tres", "pdf_folio_cuatro", "pdf_folio_cinco"]
        if field_name not in valid_fields:
            raise HTTPException(status_code=400, detail="Campo PDF inválido")

        # Verificar si el campo coincide con la ruta proporcionada (Normalizando para evitar fallos por slashes)
        current_path = getattr(solicitud, field_name)
        if not current_path or Path(current_path).as_posix() != Path(pdf_path).as_posix():
            logger.warning(f"Intento de eliminar PDF con ruta no coincidente. DB: {current_path}, Recibido: {pdf_path}")
            raise HTTPException(status_code=400, detail="La ruta del PDF no coincide con el registro")

        # 1. Eliminar de la base de datos PRIMERO
        setattr(solicitud, field_name, None)
        await session.commit()
        
        # 2. Eliminar del almacenamiento físico
        await eliminar_pdf(pdf_path)
        
        await session.commit()
        await session.refresh(solicitud)
        
        logger.info(f"PDF eliminado exitosamente de solicitud {id}: {pdf_path}")
        
        return {
            "status": "success",
            "message": "PDF eliminado exitosamente"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al eliminar PDF de solicitud {id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar el PDF: {str(e)}")


@router.delete("/todas_solicitudes/{id}", tags=["Todas las solicitudes"])
async def eliminar_todas_solicitudes(
    request: Request,
    id: int,
    preserve_files: bool = False,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):

    if not id:
        raise HTTPException(status_code=400, detail="ID no proporcionado")

    # Validar propiedad del recurso si no es administrador
    user_id = int(current_user.get("sub"))
    user_name = current_user.get("nombre") or current_user.get("primer_nombre")
    role = current_user.get("rol_nombre")
    cargo = current_user.get("cargo")

    if (role not in ["Administrador", "Supervisor", "Responsable Finanzas"] and 
        cargo not in ["Jefe de Finanzas", "Jefe de Recursos Humanos"]):
        solicitud_check = await session.get(Tabla_Todas_Solicitudes, id)
        if not solicitud_check:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        
        # Reconstrucción de nombre completo idéntica a obtener_todas_solicitudes
        full_name_parts = [
            current_user.get("primer_nombre", ""),
            current_user.get("segundo_nombre", ""),
            current_user.get("primer_apellido", ""),
            current_user.get("segundo_apellido", "")
        ]
        user_name_full = " ".join(str(part) if part else "" for part in full_name_parts).strip()
        user_name_normalized = " ".join(filter(None, [str(p) for p in full_name_parts])).strip()

        # Validar por ID o por nombre robusto
        # AUDITORÍA H-06: la coincidencia por nombre no otorga control sobre registros de un homónimo.
        if not await es_dueno_verificado(session, current_user, solicitud_check):
            raise HTTPException(status_code=403, detail="No tiene permisos para eliminar esta solicitud")

    todas_solicitudes = await session.get(Tabla_Todas_Solicitudes, id)
    if not todas_solicitudes:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    
    import os
    # [DEBUG] logger.debug(f"Ruta de eliminación alcanzada para solicitud {id}. CWD: {os.getcwd()}")
    # Eliminar PDFs asociados antes de borrar el registro (Solo si NO se solicita preservarlos)
    if not preserve_files:
        try:
            fields = ["pdf_folio_uno", "pdf_folio_dos", "pdf_folio_tres", "pdf_folio_cuatro", "pdf_folio_cinco"]
            for field in fields:
                path = getattr(todas_solicitudes, field)
                if path:
                    # [DEBUG] logger.debug(f"Intentando eliminar PDF en campo {field}: {path}")
                    await eliminar_pdf(path)
                # [DEBUG] else:
                # [DEBUG]     logger.debug(f"Campo {field} está vacío para solicitud {id}")
        except Exception as e:
            logger.error(f"Error al procesar eliminación de PDFs para solicitud {id}: {e}")

    await session.delete(todas_solicitudes)
    await session.commit()

    logger.info(f"===> Solicitud eliminada exitosamente: ID {id} (Archivos preservados: {preserve_files})")
    
    return {"status": "success", "message": "Solicitud eliminada"}