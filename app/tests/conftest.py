import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient

# Mock missing dependencies
import sys
sys.modules["argon2"] = MagicMock()
sys.modules["argon2.exceptions"] = MagicMock()
sys.modules["uvloop"] = MagicMock()

# Add app directory to sys.path
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.main import app
from app.infrastructure.db.database import get_db, init_db, close_db
from app.infrastructure.db.db_seed import seed_data
from app.infrastructure.security.auth_token_roles import get_current_user

# Mock Global Data
MOCK_USER = {
    "sub": "1",
    "email": "test@flujopago.cl",
    "rol_nombre": "Administrador",
    "primer_nombre": "Test",
    "primer_apellido": "User",
    "rut": "12345678-9"
}

@pytest.fixture
def mock_db():
    session = AsyncMock()
    # Mock commonly used methods in AsyncSession
    session.scalars = AsyncMock()
    session.get = AsyncMock()
    session.refresh = AsyncMock()
    session.commit = AsyncMock()
    session.delete = AsyncMock()
    session.add = AsyncMock()
    return session

@pytest.fixture
def mock_current_user():
    return MOCK_USER

@pytest.fixture(autouse=True)
def mock_app_lifespan(monkeypatch):
    """Evita que el lifespan intente conectar a la DB real durante los tests"""
    monkeypatch.setattr("app.main.init_db", AsyncMock())
    monkeypatch.setattr("app.main.seed_data", AsyncMock())
    monkeypatch.setattr("app.main.desactivar_credenciales_de_prueba", AsyncMock())
    monkeypatch.setattr("app.main.close_db", AsyncMock())

@pytest.fixture
def client(mock_db, mock_current_user):
    # Dependency overrides
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: mock_current_user
    
    with TestClient(app) as c:
        yield c
    
    # Clean up overrides
    app.dependency_overrides.clear()
