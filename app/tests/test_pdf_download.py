import pytest
import os
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.infrastructure.security.auth_token_roles import get_current_user

# Directorio de prueba
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DOC_PDF_DIR = BASE_DIR / "doc_pdf"

@pytest.fixture
def clean_test_pdf():
    # Crear archivo temporal para pruebas si no existe la carpeta
    DOC_PDF_DIR.mkdir(parents=True, exist_ok=True)
    test_file = DOC_PDF_DIR / "test_download_file.pdf"
    test_file.write_bytes(b"pdf mock content")
    yield "test_download_file.pdf"
    if test_file.exists():
        test_file.unlink()

@pytest.mark.asyncio
async def test_descargar_pdf_no_autenticado():
    # Remover overrides de autenticación
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]
    
    with TestClient(app) as client_no_auth:
        response = client_no_auth.get("/flujopago/gestion-pagos/v1/doc_pdf/algun_archivo.pdf", follow_redirects=False)
        # El middleware redirigirá al login con 302
        assert response.status_code == 302
        assert "/flujopago/gestion-pagos/v1/?error=session_expired" in response.headers.get("location", "")

@pytest.mark.asyncio
async def test_descargar_pdf_autenticado_archivo_inexistente(client):
    response = client.get("/flujopago/gestion-pagos/v1/doc_pdf/no_existe.pdf")
    # El middleware renderizará la plantilla HTML del 404
    assert response.status_code == 404
    assert "text/html" in response.headers.get("content-type", "")

@pytest.mark.asyncio
async def test_descargar_pdf_autenticado_exito(client, clean_test_pdf):
    response = client.get(f"/flujopago/gestion-pagos/v1/doc_pdf/{clean_test_pdf}")
    assert response.status_code == 200
    assert response.content == b"pdf mock content"
    assert "inline; filename=" in response.headers["Content-Disposition"]

@pytest.mark.asyncio
async def test_descargar_pdf_path_traversal(client):
    # Intentar acceder a un archivo fuera del directorio doc_pdf usando path traversal
    response = client.get("/flujopago/gestion-pagos/v1/doc_pdf/../requirements.txt")
    # Debería retornar 403 o 404
    assert response.status_code in (403, 404)
