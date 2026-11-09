from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pathlib import Path
import mimetypes

from app.infrastructure.security.auth_token_roles import get_current_user
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("PDF_DOWNLOAD_ROUTES")

router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

# Directorio base del proyecto (raíz donde están las carpetas doc_pdf, PDF_firmados, etc.)
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent

# Carpetas permitidas para descarga autenticada
ALLOWED_FOLDERS = {"doc_pdf", "PDF_firmados", "PDF_autorizaciones"}


def _get_safe_path(folder: str, filename: str) -> Path:
    """
    Construye y valida la ruta del archivo, previniendo path traversal.
    Solo permite acceso a las carpetas autorizadas.
    """
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada")

    folder_path = BASE_DIR / folder
    # Prevención de path traversal: resolvemos la ruta y verificamos que esté dentro de la carpeta
    file_path = (folder_path / filename).resolve()

    if not str(file_path).startswith(str(folder_path.resolve())):
        raise HTTPException(status_code=403, detail="Acceso denegado")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    return file_path


def _file_response(file_path: Path, filename: str) -> StreamingResponse:
    """
    AUDITORÍA H-03 (defensa en profundidad): solo los PDF se muestran inline. Cualquier otro tipo existente en
    disco (p.ej. un .html subido antes de la corrección) se entrega como descarga binaria, nunca como text/html.
    """
    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    disposition = "inline"
    if media_type != "application/pdf":
        media_type, disposition = "application/octet-stream", "attachment"
    return StreamingResponse(
        _stream_file(file_path),
        media_type=media_type,
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


def _stream_file(file_path: Path):
    """Genera el archivo en chunks para no cargar todo en memoria (streaming)."""
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):  # 64KB por chunk
            yield chunk


@router.get("/doc_pdf/{filename}", tags=["PDF Download"])
async def descargar_doc_pdf(
    filename: str,
    current_user: dict = Depends(get_current_user),
):
    """Descarga autenticada de documentos PDF de soporte."""
    file_path = _get_safe_path("doc_pdf", filename)
    logger.info(f"PDF descargado: doc_pdf/{filename} por usuario ID={current_user.get('sub')}")
    return _file_response(file_path, filename)


@router.get("/PDF_firmados/{filename}", tags=["PDF Download"])
async def descargar_pdf_firmado(
    filename: str,
    current_user: dict = Depends(get_current_user),
):
    """Descarga autenticada de PDFs firmados."""
    file_path = _get_safe_path("PDF_firmados", filename)
    logger.info(f"PDF descargado: PDF_firmados/{filename} por usuario ID={current_user.get('sub')}")
    return _file_response(file_path, filename)


@router.get("/PDF_autorizaciones/{filename}", tags=["PDF Download"])
async def descargar_pdf_autorizacion(
    filename: str,
    current_user: dict = Depends(get_current_user),
):
    """Descarga autenticada de PDFs de registro de autorización."""
    file_path = _get_safe_path("PDF_autorizaciones", filename)
    logger.info(f"PDF descargado: PDF_autorizaciones/{filename} por usuario ID={current_user.get('sub')}")
    return _file_response(file_path, filename)
