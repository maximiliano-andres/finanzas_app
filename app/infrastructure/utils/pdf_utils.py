import pikepdf
import re
import unicodedata
import uuid
from pathlib import Path
from app.infrastructure.utils.logger_personalizado import setup_logger
from io import BytesIO

# Definir la raíz del proyecto para asegurar que las rutas se resuelvan correctamente
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
logger = setup_logger("PDF_UTILS")

# Limpia el nombre del archivo para uso seguro en filesystem.
async def _satinizar_nombre_de_archivo(nombre_archivo: str) -> str:
    nombre_archivo = unicodedata.normalize("NFKD", nombre_archivo).encode("ascii", "ignore").decode()
    nombre_archivo = re.sub(r"[^\w\-. ]", "_", nombre_archivo)
    return nombre_archivo.strip().replace(" ", "_")

# Guarda el PDF optimizado conservando el nombre original
# + sufijo UUID para evitar colisiones.
async def optimizar_y_guardar_pdf(file_content: bytes, original_filename: str, numero_folio: str, folder_name: str = "doc_pdf") -> str:

    storage_path = Path(folder_name)
    storage_path.mkdir(parents=True, exist_ok=True)

    try:
        nombre_limpio = await _satinizar_nombre_de_archivo(original_filename)
        nombre_base = Path(nombre_limpio).stem
        # AUDITORÍA H-03: siempre ".pdf"; antes se conservaba la extensión del cliente (p.ej. .html → XSS al servirlo).
        ext = ".pdf"

        nombre_de_archivo_unico = f"{numero_folio}_{nombre_base}_{uuid.uuid4().hex}{ext}"
        full_path = storage_path / nombre_de_archivo_unico

        #with pikepdf.open(file_content) as pdf:
        with pikepdf.open(BytesIO(file_content)) as pdf:
            # Eliminar metadata innecesaria para reducir tamaño
            with pdf.open_metadata() as meta:
                pass # Esto a veces limpia estructuras antiguas según la versión de pikepdf

            pdf.save(
                full_path,
                linearize=True,
                compress_streams=True,
                recompress_flate=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate
            )

        logger.info(f"PDF optimizado y guardado con éxito (ObjectStreams): {full_path}")
        return str(full_path)

    except Exception as e:
        logger.error(f"Error al optimizar PDF {original_filename}: {e}")

        # Fallback seguro
        try:
            nombre_limpio = await _satinizar_nombre_de_archivo(original_filename)
            nombre_base = Path(nombre_limpio).stem
            # AUDITORÍA H-03: siempre ".pdf"; antes se conservaba la extensión del cliente (p.ej. .html → XSS al servirlo).
            ext = ".pdf"

            nombre_de_archivo_unico = f"{numero_folio}_{nombre_base}_{uuid.uuid4().hex}{ext}"
            fallback_path = storage_path / nombre_de_archivo_unico
            with open(fallback_path, "wb") as f:
                f.write(file_content)

            logger.warning(f"PDF guardado sin optimizar: {fallback_path}")
            return str(fallback_path)

        except Exception as e2:
            logger.critical(f"Error crítico al guardar PDF: {e2}")
            raise


async def eliminar_pdf(path_str: str) -> None:
    """
    Elimina físicamente un archivo PDF del almacenamiento.
    Asegura que la ruta se resuelva contra la raíz del proyecto.
    """
    try:
        if not path_str:
            return
            
        # Normalizar y resolver ruta absoluta basada en la raíz del proyecto
        p = Path(path_str)
        if not p.is_absolute():
            p = (BASE_DIR / p).resolve()
            
        if p.exists():
            p.unlink()
            logger.info(f"PDF eliminado físicamente con éxito: {p}")
        else:
            logger.warning(f"No se pudo encontrar el archivo físico para eliminar: {p}")
    except Exception as e:
        logger.error(f"Error al eliminar PDF {path_str}: {e}")