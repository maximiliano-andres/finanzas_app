import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.mark.asyncio
async def test_get_historico_solicitud_success(client, mock_db):
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    
    response = client.get("/flujopago/gestion-pagos/v1/historico/solicitud/1")
    assert response.status_code == 200
    assert response.json()["data"] == []

@pytest.mark.asyncio
async def test_get_todo_historico_success(client, mock_db):
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    
    response = client.get("/flujopago/gestion-pagos/v1/historico?limit=10&offset=0")
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)

@pytest.mark.asyncio
async def test_get_historico_por_estado_success(client, mock_db):
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    
    response = client.get("/flujopago/gestion-pagos/v1/historico/estado/PENDIENTE")
    assert response.status_code == 200

@pytest.mark.asyncio
async def test_get_historico_por_estado_invalid(client, mock_db):
    response = client.get("/flujopago/gestion-pagos/v1/historico/estado/ESTADO_FALSO")
    assert response.status_code == 400
    assert "Estado inválido" in response.json()["detail"]

@pytest.mark.asyncio
async def test_get_historico_estadisticas_success(client, mock_db):
    # This one has multiple execute calls, we'll return different values or a generic successful mock
    mock_execute_result = MagicMock()
    mock_execute_result.scalar.return_value = 10
    mock_execute_result.all.return_value = [("PENDIENTE", 5), ("APROBADO", 5)]
    mock_execute_result.first.return_value = (1, 3) # id_solicitud, cambios
    mock_execute_result.scalar_one_or_none.return_value = None # ultimo registro
    
    mock_db.execute.return_value = mock_execute_result
    
    response = client.get("/flujopago/gestion-pagos/v1/historico/estadisticas")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total_registros"] == 10
    assert "PENDIENTE" in data["por_estado"]
