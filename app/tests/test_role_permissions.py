import pytest
from fastapi import status
from app.main import app
from app.infrastructure.db.database import get_db
from app.infrastructure.security.auth_token_roles import get_current_user

# Mock database session
@pytest.fixture
def mock_db_session():
    from unittest.mock import AsyncMock
    return AsyncMock()

def set_current_user_role(role_name: str):
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "2",
        "email": "user@flujopago.cl",
        "rol_nombre": role_name,
        "primer_nombre": "Test",
        "primer_apellido": "User",
        "rut": "12345678-9"
    }

def clean_dependencies():
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]


# ===========================================================================
# BLOQUE 1: Pruebas de Lectura (GET) permitidas para cualquier Rol
# ===========================================================================

def test_non_admin_can_read_empresas(client, mock_db_session):
    """Cualquier usuario autenticado (ej: Solicitante) puede consultar empresas."""
    set_current_user_role("Solicitante")
    
    # Mock query response
    from unittest.mock import MagicMock
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db_session.execute.return_value = mock_result
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        response = client.get("/flujopago/gestion-pagos/v1/empresas")
        assert response.status_code == 200
    finally:
        clean_dependencies()
        if get_db in app.dependency_overrides:
            del app.dependency_overrides[get_db]


def test_non_admin_can_read_procesos(client, mock_db_session):
    """Cualquier usuario autenticado (ej: Solicitante) puede consultar procesos."""
    set_current_user_role("Solicitante")
    
    from unittest.mock import MagicMock
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db_session.execute.return_value = mock_result
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        response = client.get("/flujopago/gestion-pagos/v1/procesos")
        assert response.status_code == 200
    finally:
        clean_dependencies()
        if get_db in app.dependency_overrides:
            del app.dependency_overrides[get_db]


# ===========================================================================
# BLOQUE 2: Pruebas de Escritura (POST/PUT/DELETE) Bloqueadas para no-Admin
# ===========================================================================

def test_non_admin_cannot_create_user(client):
    """Un rol no administrativo (ej: Solicitante) no puede crear usuarios (403)."""
    set_current_user_role("Solicitante")
    
    user_data = {
        "cargo": "Analista de Personal",
        "nombre_1": "Fake",
        "apellido_1": "User",
        "email": "fake@flujopago.cl",
        "rol_id": 2,
        "rut": "11111111-1"
    }

    try:
        response = client.post("/flujopago/gestion-pagos/v1/usuarios", json=user_data)
        assert response.status_code == 403
        assert "Acceso denegado" in response.json()["detail"]
    finally:
        clean_dependencies()


def test_non_admin_cannot_create_empresa(client):
    """Un rol no administrativo (ej: Solicitante) no puede crear empresas (403)."""
    set_current_user_role("Solicitante")
    
    empresa_data = {
        "empresa": "Empresa Falsa S.A.",
        "codigo": "EMP-FAKE"
    }

    try:
        response = client.post("/flujopago/gestion-pagos/v1/empresas", json=empresa_data)
        assert response.status_code == 403
        assert "Acceso denegado" in response.json()["detail"]
    finally:
        clean_dependencies()


def test_non_admin_cannot_delete_proceso(client):
    """Un rol no administrativo (ej: Solicitante) no puede eliminar procesos (403)."""
    set_current_user_role("Solicitante")

    try:
        response = client.delete("/flujopago/gestion-pagos/v1/procesos/1")
        assert response.status_code == 403
        assert "Acceso denegado" in response.json()["detail"]
    finally:
        clean_dependencies()


# ===========================================================================
# BLOQUE 3: Administrador tiene acceso completo (POST)
# ===========================================================================

def test_admin_can_access_create_empresa(client, mock_db_session):
    """El Administrador sí tiene acceso a la creación de empresas (pasa validación de rol)."""
    set_current_user_role("Administrador")
    
    from unittest.mock import AsyncMock, patch
    # Mock database flow to avoid real DB creation
    with patch("app.interfaces.api.routers.empresa_routes.crear_empresa_service", new_callable=AsyncMock) as mock_service:
        from unittest.mock import MagicMock
        mock_empresa = MagicMock()
        mock_empresa.id = 1
        mock_empresa.empresa = "Empresa Real S.A."
        mock_empresa.codigo = "EMP-REAL"
        mock_service.return_value = (mock_empresa, None)
        
        app.dependency_overrides[get_db] = lambda: mock_db_session

        empresa_data = {
            "empresa": "Empresa Real S.A.",
            "codigo": "EMP-REAL"
        }

        try:
            response = client.post("/flujopago/gestion-pagos/v1/empresas", json=empresa_data)
            # Debe pasar la validación del rol 403 (e intentar procesarlo, retornando 200)
            assert response.status_code == 200
        finally:
            clean_dependencies()
            if get_db in app.dependency_overrides:
                del app.dependency_overrides[get_db]
