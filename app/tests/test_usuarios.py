import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime
from app.domain.models.tabla_usuarios import Usuarios
from app.domain.dto.usuariosDTO import CargosDisponibles

@pytest.mark.asyncio
async def test_get_usuarios_success(client, mock_db):
    # Setup mock data
    mock_user = Usuarios(
        id=1,
        email="test@flujopago.cl",
        nombre_1="test",
        apellido_1="user",
        cargo=CargosDisponibles.Analista_personal,
        rol_id=1,
        rut="12345678-9",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    mock_user.rol = MagicMock()
    mock_user.rol.nombre = "Administrador"
    
    # Mock para el conteo (func.count())
    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 1
    
    # Mock para los resultados paginados
    mock_result = MagicMock()
    mock_result.unique.return_value.scalars.return_value.all.return_value = [mock_user]
    
    # Configurar el mock de la sesión para que retorne los resultados correctos
    # IMPORTANTE: paginate_query solo llama a execute UNA VEZ si no hay limit/offset
    mock_db.execute = AsyncMock(return_value=mock_result)
    
    response = client.get("/flujopago/gestion-pagos/v1/usuarios")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["email"] == "test@flujopago.cl"

@pytest.mark.asyncio
async def test_crear_usuario_success(client, mock_db):
    user_data = {
        "cargo": CargosDisponibles.Analista_personal.value,
        "nombre_1": "Nuevo",
        "apellido_1": "Usuario",
        "email": "nuevo@flujopago.cl",
        "rol_id": 2,
        "rut": "12345678-0",
        # Sin password: el sistema lo genera automáticamente
    }
    
    # Mock the service instead of internal DB calls for isolation
    with patch("app.interfaces.api.routers.usuario_routes.crear_usuario_service") as mock_service:
        mock_user = Usuarios(
            id=2, 
            email="nuevo@flujopago.cl",
            nombre_1="nuevo",
            apellido_1="usuario",
            cargo=CargosDisponibles.Analista_personal,
            rol_id=2,
            rut="12345678-0",
            must_change_password=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        mock_user.rol = MagicMock()
        mock_user.rol.nombre = "Aprobador"
        
        # El servicio ahora devuelve (usuario, temp_password, error)
        mock_service.return_value = (mock_user, "ab12-cd34-ef56", None)
        
        response = client.post("/flujopago/gestion-pagos/v1/usuarios", json=user_data)
        
        if response.status_code == 422:
            print(f"DEBUG Validation Error: {response.json()}")
            
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["email"] == "nuevo@flujopago.cl"
        # La contraseña temporal debe incluirse en la respuesta de creación
        assert data["temp_password"] == "ab12-cd34-ef56"

@pytest.mark.asyncio
async def test_eliminar_usuario_success(client, mock_db):
    mock_user = Usuarios(id=1, email="test@flujopago.cl", created_at=datetime.utcnow())
    mock_db.get.return_value = mock_user
    
    response = client.delete("/flujopago/gestion-pagos/v1/usuarios/1")
    
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    # El middleware detecta 'status' pero no 'timestamp', así que puede estar envuelto o no
    # según si success_response ya fue llamado en el router.
    # En el router usuario_routes.py:81, no se llama a success_response manualmente.
    # Así que el middleware lo envuelve.
    assert response.json()["data"]["status"] == "success"
    mock_db.delete.assert_called_once()

@pytest.mark.asyncio
async def test_eliminar_usuario_not_found(client, mock_db):
    mock_db.get.return_value = None
    
    response = client.delete("/flujopago/gestion-pagos/v1/usuarios/999")
    
    assert response.status_code == 404
    assert "Usuario no encontrado" in response.json()["detail"]

@pytest.mark.asyncio
async def test_modificar_usuario_success(client, mock_db):
    mock_user = Usuarios(
        id=1,
        email="original@flujopago.cl",
        nombre_1="original",
        apellido_1="original",
        cargo=CargosDisponibles.Analista_personal,
        rol_id=1,
        rut="1-1",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    mock_user.rol = MagicMock()
    mock_user.rol.nombre = "Administrador"
    mock_db.get.return_value = mock_user
    
    update_data = {
        "cargo": CargosDisponibles.jefe_RRHH.value,
        "nombre_1": "Modificado",
        "apellido_1": "Modificado",
        "email": "mod@flujopago.cl",
        "rol_id": 1,
        "rut": "12345678-9"
    }
    
    response = client.put("/flujopago/gestion-pagos/v1/usuarios/1", json=update_data)
    
    assert response.status_code == 200
    assert response.json()["data"]["nombre_1"] == "modificado"
    assert mock_user.cargo == CargosDisponibles.jefe_RRHH

@pytest.mark.asyncio
async def test_crear_usuario_grupodemo_success(client, mock_db):
    user_data = {
        "cargo": CargosDisponibles.Analista_personal.value,
        "nombre_1": "Cordillera",
        "apellido_1": "User",
        "email": "user@grupodemo.cl",
        "rol_id": 2,
        "rut": "87654321-0",
        # Sin password: el sistema lo genera automáticamente
    }
    
    with patch("app.interfaces.api.routers.usuario_routes.crear_usuario_service") as mock_service:
        mock_user = Usuarios(
            id=3, 
            email="user@grupodemo.cl",
            nombre_1="cordillera",
            apellido_1="user",
            cargo=CargosDisponibles.Analista_personal,
            rol_id=2,
            rut="87654321-0",
            must_change_password=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        mock_user.rol = MagicMock()
        mock_user.rol.nombre = "Solicitante"
        
        # El servicio ahora devuelve (usuario, temp_password, error)
        mock_service.return_value = (mock_user, "gh78-ij90-kl12", None)
        
        response = client.post("/flujopago/gestion-pagos/v1/usuarios", json=user_data)
        
        assert response.status_code == 200
        assert response.json()["data"]["email"] == "user@grupodemo.cl"
        assert "temp_password" in response.json()["data"]

@pytest.mark.asyncio
async def test_crear_usuario_invalid_domain_fails(client, mock_db):
    user_data = {
        "cargo": CargosDisponibles.Analista_personal.value,
        "nombre_1": "Invalid",
        "apellido_1": "User",
        "email": "user@gmail.com", # Invalid domain
        "rol_id": 2,
        "rut": "99999999-9",
        "password": "Password123!",
        "password_2": "Password123!"
    }
    
    # We don't even need to mock the service here because validation happens in the DTO (Pydantic)
    # before the service is even called.
    response = client.post("/flujopago/gestion-pagos/v1/usuarios", json=user_data)
    
    assert response.status_code == 422
    assert "El correo debe pertenecer al dominio @flujopago.cl o @grupodemo.cl" in response.json()["detail"][0]["msg"]


@pytest.mark.asyncio
async def test_crear_usuario_pushhr_domain_success(client, mock_db):
    user_data = {
        "cargo": CargosDisponibles.Analista_personal.value,
        "nombre_1": "Pushhr",
        "apellido_1": "User",
        "email": "Max.andres@Pushhr.cl", # Test domain with mixed casing
        "rol_id": 2,
        "rut": "77777777-7",
        "password": "Password123!",
        "password_2": "Password123!"
    }
    
    with patch("app.interfaces.api.routers.usuario_routes.crear_usuario_service") as mock_service:
        mock_user = Usuarios(
            id=4, 
            email="max.andres@pushhr.cl",
            nombre_1="Pushhr",
            apellido_1="User",
            cargo=CargosDisponibles.Analista_personal,
            rol_id=2,
            rut="77777777-7",
            must_change_password=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        mock_user.rol = MagicMock()
        mock_user.rol.nombre = "Solicitante"
        mock_service.return_value = (mock_user, "gh78-ij90-kl12", None)
        
        response = client.post("/flujopago/gestion-pagos/v1/usuarios", json=user_data)
        
        assert response.status_code == 200
        assert response.json()["data"]["email"] == "max.andres@pushhr.cl"

