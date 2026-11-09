import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app

@pytest.mark.asyncio
async def test_login_exitoso_limpia_intentos(client):
    """Un login exitoso debe invocar clear_login_attempts."""
    login_data = {
        "email": "test@flujopago.cl",
        "password": "correct_password",
        "remember_device": False
    }

    with patch("app.interfaces.api.routers.dashboard_routes.login_service", new_callable=AsyncMock) as mock_login_service, \
         patch("app.interfaces.api.routers.dashboard_routes.is_login_locked", new_callable=AsyncMock) as mock_is_locked, \
         patch("app.interfaces.api.routers.dashboard_routes.clear_login_attempts", new_callable=AsyncMock) as mock_clear:
        
        mock_is_locked.return_value = False
        mock_login_service.return_value = {
            "access_token": "fake-access-token",
            "refresh_token": "fake-refresh-token",
            "token_type": "bearer"
        }

        # Mock token decoding inside dashboard_routes.py
        with patch("app.interfaces.api.routers.dashboard_routes.verify_token") as mock_verify_token:
            mock_verify_token.return_value = {
                "sub": "1",
                "email": "test@flujopago.cl",
                "rol_nombre": "Administrador"
            }
            
            response = client.post("/flujopago/gestion-pagos/v1/login", json=login_data)
            
            assert response.status_code == 200
            assert response.json()["status"] == "success"
            mock_is_locked.assert_called_once_with("test@flujopago.cl", "testclient")
            mock_login_service.assert_called_once()
            mock_clear.assert_called_once_with("test@flujopago.cl", "testclient")


@pytest.mark.asyncio
async def test_login_fallido_incrementa_intentos(client):
    """Un login fallido (HTTP 401) debe invocar increment_login_attempts."""
    login_data = {
        "email": "test@flujopago.cl",
        "password": "wrong_password",
        "remember_device": False
    }

    with patch("app.interfaces.api.routers.dashboard_routes.login_service", new_callable=AsyncMock) as mock_login_service, \
         patch("app.interfaces.api.routers.dashboard_routes.is_login_locked", new_callable=AsyncMock) as mock_is_locked, \
         patch("app.interfaces.api.routers.dashboard_routes.increment_login_attempts", new_callable=AsyncMock) as mock_increment:
        
        mock_is_locked.return_value = False
        mock_login_service.side_effect = HTTPException(status_code=401, detail="Credenciales inválidas")

        response = client.post("/flujopago/gestion-pagos/v1/login", json=login_data)
        
        assert response.status_code == 401
        assert response.json()["status"] == "error"
        mock_is_locked.assert_called_once_with("test@flujopago.cl", "testclient")
        mock_increment.assert_called_once_with("test@flujopago.cl", "testclient")


@pytest.mark.asyncio
async def test_login_bloqueado_retorna_429(client):
    """Si el usuario está bloqueado, no se debe llamar a login_service y se retorna 429."""
    login_data = {
        "email": "test@flujopago.cl",
        "password": "any_password",
        "remember_device": False
    }

    with patch("app.interfaces.api.routers.dashboard_routes.login_service", new_callable=AsyncMock) as mock_login_service, \
         patch("app.interfaces.api.routers.dashboard_routes.is_login_locked", new_callable=AsyncMock) as mock_is_locked, \
         patch("app.interfaces.api.routers.dashboard_routes.increment_login_attempts", new_callable=AsyncMock) as mock_increment:
        
        mock_is_locked.return_value = True

        response = client.post("/flujopago/gestion-pagos/v1/login", json=login_data)
        
        assert response.status_code == 429
        assert response.json()["status"] == "error"
        assert "Demasiados intentos fallidos" in response.json()["message"]
        
        mock_is_locked.assert_called_once_with("test@flujopago.cl", "testclient")
        mock_login_service.assert_not_called()
        mock_increment.assert_not_called()
