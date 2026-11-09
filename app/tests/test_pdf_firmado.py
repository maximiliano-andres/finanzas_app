import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from io import BytesIO
import json

@pytest.mark.asyncio
async def test_upload_pdf_firmado_success(client, mock_db):
    ids = [1, 2, 3]
    payload = {"ids": json.dumps(ids)}
    files = [
        ("pdf", ("firmado.pdf", BytesIO(b"signed content"), "application/pdf"))
    ]
    
    with patch("app.interfaces.api.routers.pdf_firmado_routes.optimizar_y_guardar_pdf") as mock_save:
        mock_save.return_value = "path/to/signed.pdf"
        
        response = client.post("/flujopago/gestion-pagos/v1/pdf-firmado/upload", data=payload, files=files)
        
        assert response.status_code == 200
        assert response.json()["data"]["pdf_path"] == "path/to/signed.pdf"
        # Auditoría H-26: solo se actualiza la tabla de origen (solicitudes por defecto); antes también
        # recepcionados con el mismo ID, que es otro registro.
        assert mock_db.execute.call_count == 1

@pytest.mark.asyncio
async def test_upload_pdf_firmado_invalid_ids(client, mock_db):
    payload = {"ids": "not-a-json"}
    files = [
        ("pdf", ("f.pdf", BytesIO(b"c"), "application/pdf"))
    ]
    
    response = client.post("/flujopago/gestion-pagos/v1/pdf-firmado/upload", data=payload, files=files)
    assert response.status_code == 400

@pytest.mark.asyncio
async def test_delete_pdf_firmado_success(client, mock_db):
    mock_recep = MagicMock()
    mock_recep.pdf_firmado = "path/to/delete.pdf"
    mock_db.get.return_value = mock_recep
    
    # La búsqueda de filas del histórico (id + folio) se valida en tests/integration con BD real.
    with patch("app.domain.services.documentos_flujo_service.condicion_historico", new=AsyncMock(return_value=None)), \
         patch("app.interfaces.api.routers.pdf_firmado_routes.eliminar_pdf", new_callable=AsyncMock) as mock_del:
        response = client.delete("/flujopago/gestion-pagos/v1/pdf-firmado/delete/1")
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        mock_del.assert_called_once()

@pytest.mark.asyncio
async def test_delete_pdf_firmado_not_found(client, mock_db):
    mock_db.get.return_value = None # Not in recep
    
    # Nested mock for the second 'get' call in all solicitudes
    with patch.object(mock_db, 'get', return_value=None):
        response = client.delete("/flujopago/gestion-pagos/v1/pdf-firmado/delete/999")
        assert response.status_code == 404
        assert "No se encontró PDF firmado" in response.json()["detail"]
