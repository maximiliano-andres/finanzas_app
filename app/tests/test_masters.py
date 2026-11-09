import pytest
from unittest.mock import AsyncMock, MagicMock, patch

@pytest.mark.asyncio
async def test_get_empresas_success(client, mock_db):
    mock_result = MagicMock()
    # scalars() returns an AsyncMock that when awaited returns a list/mock
    mock_result_scalars = MagicMock()
    mock_result_scalars.all.return_value = []
    mock_result.scalars.return_value = mock_result_scalars
    
    mock_db.execute = AsyncMock(return_value=mock_result)
    
    response = client.get("/flujopago/gestion-pagos/v1/empresas")
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)

@pytest.mark.asyncio
async def test_crear_empresa_success(client, mock_db):
    payload = {"empresa": "Nueva Empresa", "codigo": "NE01"}
    
    with patch("app.interfaces.api.routers.empresa_routes.crear_empresa_service") as mock_service:
        mock_empresa = MagicMock()
        mock_empresa.id = 1
        mock_empresa.empresa = "Nueva Empresa"
        mock_empresa.codigo = "NE01"
        mock_service.return_value = (mock_empresa, None)
        
        response = client.post("/flujopago/gestion-pagos/v1/empresas", json=payload)
        assert response.status_code == 200

@pytest.mark.asyncio
async def test_get_roles_success(client, mock_db):
    mock_result = MagicMock()
    mock_result_scalars = MagicMock()
    mock_result_scalars.all.return_value = []
    mock_result.scalars.return_value = mock_result_scalars
    
    mock_db.execute = AsyncMock(return_value=mock_result)
    
    response = client.get("/flujopago/gestion-pagos/v1/roles")
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)

@pytest.mark.asyncio
async def test_get_procesos_success(client, mock_db):
    mock_result = MagicMock()
    mock_result_scalars = MagicMock()
    mock_result_scalars.all.return_value = []
    mock_result.scalars.return_value = mock_result_scalars
    
    mock_db.execute = AsyncMock(return_value=mock_result)
    
    response = client.get("/flujopago/gestion-pagos/v1/procesos")
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)
