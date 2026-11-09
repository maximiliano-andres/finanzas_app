from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db
from app.infrastructure.utils.pdf_utils import optimizar_y_guardar_pdf, eliminar_pdf
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.security.auth_token_roles import get_current_user
from app.infrastructure.security.permisos import puede_gestionar_documentos_flujo
from app.domain.services.documentos_flujo_service import asignar_campo, modelo_origen, parsear_ids

logger = setup_logger("PDF_FIRMADO_ROUTES")

router = APIRouter(prefix="/flujopago/gestion-pagos/v1")


@router.post("/pdf-firmado/upload", tags=["PDF Firmado"])
async def upload_pdf_firmado(
    ids: str = Form(...),  # JSON array de IDs
    pdf: UploadFile = File(...),
    # AUDITORÍA H-26: tabla a la que pertenecen los IDs. Opcional; por defecto "solicitud" (lo que envía el frontend).
    origen: str = Form("solicitud"),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Carga un PDF firmado y lo asocia a uno o más registros de la tabla de `origen`
    ("solicitud" por defecto, o "recepcionado"). La actualización es transaccional.
    """
    # AUDITORÍA H-07c: exclusivo de los roles del flujo (Aprobaciones / Finanzas); antes cualquier usuario.
    if not puede_gestionar_documentos_flujo(current_user):
        raise HTTPException(status_code=403, detail="No tiene permisos para gestionar este documento")
    solicitud_ids = parsear_ids(ids)
    modelo = modelo_origen(origen)

    if pdf.content_type != 'application/pdf':
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")

    content = await pdf.read()
    filename_base = f"firmado_multiple_{solicitud_ids[0]}" if len(solicitud_ids) > 1 else f"firmado_{solicitud_ids[0]}"
    try:
        pdf_path = await optimizar_y_guardar_pdf(content, pdf.filename, filename_base, "PDF_firmados")
    except Exception as e:
        logger.error(f"Error al procesar carga de PDF firmado: {e}")
        raise HTTPException(status_code=500, detail="Error al procesar el archivo")

    try:
        # Igual que antes, la carga no modifica el histórico (solo la eliminación lo limpia).
        await asignar_campo(session, modelo, solicitud_ids, "pdf_firmado", pdf_path, incluir_historico=False)
        await session.commit()
    except Exception as e:
        await session.rollback()
        await eliminar_pdf(pdf_path)
        logger.error(f"Error en transacción de actualización de PDF firmado: {e}")
        raise HTTPException(status_code=500, detail="Error al actualizar la base de datos")

    logger.info(f"PDF firmado cargado y asociado a {len(solicitud_ids)} registros ({origen}): {pdf_path}")
    return {
        "status": "success",
        "message": f"PDF asociado correctamente a {len(solicitud_ids)} solicitudes",
        "pdf_path": pdf_path
    }


@router.delete("/pdf-firmado/delete/{id}", tags=["PDF Firmado"])
async def delete_pdf_firmado(
    id: int,
    origen: str = "solicitud",  # AUDITORÍA H-26: query param opcional
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Elimina el PDF firmado del registro `id` de la tabla de `origen` (y de su rastro en el histórico)
    y lo borra del almacenamiento físico. Transaccional.
    """
    # AUDITORÍA H-07c: exclusivo de los roles del flujo (Aprobaciones / Finanzas); antes cualquier usuario.
    if not puede_gestionar_documentos_flujo(current_user):
        raise HTTPException(status_code=403, detail="No tiene permisos para gestionar este documento")
    modelo = modelo_origen(origen)

    registro = await session.get(modelo, id)
    pdf_path = registro.pdf_firmado if registro else None
    if not pdf_path:
        raise HTTPException(status_code=404, detail="No se encontró PDF firmado asociado a este ID")

    try:
        await asignar_campo(session, modelo, [id], "pdf_firmado", None, incluir_historico=True)
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Error en transacción de eliminación de PDF firmado ID {id}: {e}")
        raise HTTPException(status_code=500, detail="Error al actualizar la base de datos")

    await eliminar_pdf(pdf_path)
    logger.info(f"PDF firmado eliminado para {origen} ID {id}: {pdf_path}")
    return {
        "status": "success",
        "message": "PDF firmado eliminado correctamente"
    }
