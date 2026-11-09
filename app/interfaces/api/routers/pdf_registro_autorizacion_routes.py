from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db
from app.infrastructure.utils.pdf_utils import optimizar_y_guardar_pdf, eliminar_pdf
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.security.auth_token_roles import get_current_user
from app.infrastructure.security.permisos import puede_gestionar_documentos_flujo
from app.domain.services.documentos_flujo_service import asignar_campo, modelo_origen, parsear_ids

logger = setup_logger("PDF_REGISTRO_AUTORIZACION_ROUTES")

router = APIRouter(prefix="/flujopago/gestion-pagos/v1")


@router.post("/pdf-registro-autorizacion/upload", tags=["PDF Registro Autorización"])
async def upload_pdf_registro_autorizacion(
    ids: str = Form(...),
    pdf: UploadFile = File(...),
    # AUDITORÍA H-26: tabla a la que pertenecen los IDs. Opcional; por defecto "solicitud" (lo que envía el frontend).
    origen: str = Form("solicitud"),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Carga un PDF de registro de autorización y lo asocia a los registros de la tabla de `origen`
    y a su rastro en el histórico. Si ya existía un PDF anterior, lo elimina del almacenamiento
    (después de confirmar la transacción). Transaccional.
    """
    # AUDITORÍA H-07c: exclusivo de los roles del flujo (Aprobaciones / Finanzas); antes cualquier usuario.
    if not puede_gestionar_documentos_flujo(current_user):
        raise HTTPException(status_code=403, detail="No tiene permisos para gestionar este documento")
    solicitud_ids = parsear_ids(ids)
    modelo = modelo_origen(origen)

    if pdf.content_type != 'application/pdf':
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")

    content = await pdf.read()
    anteriores = {
        p for p in (await session.execute(
            select(modelo.pdf_registro_autorizacion).where(modelo.id.in_(solicitud_ids))
        )).scalars().all() if p
    }

    try:
        pdf_path = await optimizar_y_guardar_pdf(content, pdf.filename, f"autorizacion_{solicitud_ids[0]}", "PDF_autorizaciones")
    except Exception as e:
        logger.error(f"Error al procesar carga de PDF de autorización: {e}")
        raise HTTPException(status_code=500, detail="Error al procesar el archivo")

    try:
        await asignar_campo(session, modelo, solicitud_ids, "pdf_registro_autorizacion", pdf_path, incluir_historico=True)
        await session.commit()
    except Exception as e:
        await session.rollback()
        await eliminar_pdf(pdf_path)
        logger.error(f"Error en transacción de PDF de autorización: {e}")
        raise HTTPException(status_code=500, detail="Error al actualizar la base de datos")

    # Los archivos anteriores se borran solo tras confirmar la BD (antes se borraban primero).
    for anterior in anteriores - {pdf_path}:
        await eliminar_pdf(anterior)

    logger.info(f"PDF de autorización cargado para {len(solicitud_ids)} registros ({origen}): {pdf_path}")
    return {
        "status": "success",
        "message": f"PDF de autorización asociado correctamente a {len(solicitud_ids)} solicitudes",
        "pdf_path": pdf_path
    }


@router.delete("/pdf-registro-autorizacion/delete/{id}", tags=["PDF Registro Autorización"])
async def delete_pdf_registro_autorizacion(
    id: int,
    origen: str = "solicitud",  # AUDITORÍA H-26: query param opcional
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """
    Elimina el PDF de registro de autorización del registro `id` de la tabla de `origen`
    (y de su rastro en el histórico) y lo borra del almacenamiento físico. Transaccional.
    """
    # AUDITORÍA H-07c: exclusivo de los roles del flujo (Aprobaciones / Finanzas); antes cualquier usuario.
    if not puede_gestionar_documentos_flujo(current_user):
        raise HTTPException(status_code=403, detail="No tiene permisos para gestionar este documento")
    modelo = modelo_origen(origen)

    registro = await session.get(modelo, id)
    pdf_path = registro.pdf_registro_autorizacion if registro else None
    if not pdf_path:
        raise HTTPException(status_code=404, detail="No se encontró PDF de autorización asociado a este ID")

    try:
        await asignar_campo(session, modelo, [id], "pdf_registro_autorizacion", None, incluir_historico=True)
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Error en transacción de eliminación de PDF de autorización ID {id}: {e}")
        raise HTTPException(status_code=500, detail="Error al actualizar la base de datos")

    await eliminar_pdf(pdf_path)
    logger.info(f"PDF de autorización eliminado para {origen} ID {id}: {pdf_path}")
    return {
        "status": "success",
        "message": "PDF de autorización eliminado correctamente"
    }
