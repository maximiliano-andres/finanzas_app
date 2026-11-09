"""
Tests para la funcionalidad de seguridad de credenciales:
- Creación de usuario con must_change_password=True y sin contraseña manual del admin
- Restablecimiento de contraseña por el administrador
- Generación de contraseñas temporales criptográficas
- Verificación de que el flujo de force-change ya existente sigue funcionando
- Aislamiento de fallos de SMTP (usuario se crea aunque el correo falle)
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime
from app.domain.models.tabla_usuarios import Usuarios
from app.domain.dto.usuariosDTO import CargosDisponibles
from app.domain.services.usuario_service import generar_password_temporal


# ===========================================================================
# BLOQUE 1: Generación de contraseñas temporales
# ===========================================================================

def test_generar_password_temporal_formato():
    """La contraseña temporal debe tener el formato XXXX-XXXX-XXXX."""
    password = generar_password_temporal()
    partes = password.split("-")
    assert len(partes) == 3, "Debe tener 3 partes separadas por guiones"
    for parte in partes:
        assert len(parte) == 4, f"Cada parte debe tener 4 caracteres, got: {parte}"


def test_generar_password_temporal_unicidad():
    """Dos contraseñas temporales generadas no deben ser iguales."""
    passwords = {generar_password_temporal() for _ in range(20)}
    assert len(passwords) == 20, "Todas las contraseñas temporales deben ser únicas"


# ===========================================================================
# BLOQUE 2: Creación de usuario con seguridad
# ===========================================================================

@pytest.mark.asyncio
async def test_crear_usuario_sets_must_change_password(client, mock_db):
    """
    Al crear un usuario, must_change_password debe activarse (True).
    El administrador no debe proveer contraseña; el sistema la genera.
    """
    user_data = {
        "cargo": CargosDisponibles.Analista_personal.value,
        "nombre_1": "Carlos",
        "apellido_1": "Pérez",
        "email": "carlos@flujopago.cl",
        "rol_id": 2,
        "rut": "12345678-1",
    }

    with patch("app.infrastructure.mailing.email_service.send_email_async", new_callable=AsyncMock) as mock_mail, \
         patch("app.interfaces.api.routers.usuario_routes.crear_usuario_service") as mock_service:

        mock_user = Usuarios(
            id=10,
            email="carlos@flujopago.cl",
            nombre_1="Carlos",
            apellido_1="Pérez",
            cargo=CargosDisponibles.Analista_personal,
            rol_id=2,
            rut="12345678-1",
            must_change_password=True,  # <-- debe estar en True
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        mock_user.rol = MagicMock()
        mock_user.rol.nombre = "Analista"
        # El servicio ahora devuelve (usuario, temp_password, error)
        mock_service.return_value = (mock_user, "temp-ab12", None)
        mock_mail.return_value = True

        response = client.post("/flujopago/gestion-pagos/v1/usuarios", json=user_data)

        assert response.status_code == 200
        # El endpoint devuelve el usuario creado
        data = response.json()
        assert data["data"]["email"] == "carlos@flujopago.cl"


@pytest.mark.asyncio
async def test_crear_usuario_sin_password_en_body(client, mock_db):
    """
    La creación de usuario no debe requerir password en el body del request.
    El campo password en UsuariosIn es Optional (None).
    """
    user_data = {
        "cargo": CargosDisponibles.Analista_personal.value,
        "nombre_1": "María",
        "apellido_1": "González",
        "email": "maria@flujopago.cl",
        "rol_id": 2,
        "rut": "98765432-1",
        # Sin "password" ni "password_2"
    }

    with patch("app.interfaces.api.routers.usuario_routes.crear_usuario_service") as mock_service:
        mock_user = Usuarios(
            id=11,
            email="maria@flujopago.cl",
            nombre_1="María",
            apellido_1="González",
            cargo=CargosDisponibles.Analista_personal,
            rol_id=2,
            rut="98765432-1",
            must_change_password=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        mock_user.rol = MagicMock()
        mock_user.rol.nombre = "Analista"
        # El servicio ahora devuelve (usuario, temp_password, error)
        mock_service.return_value = (mock_user, "temp-cd34", None)

        response = client.post("/flujopago/gestion-pagos/v1/usuarios", json=user_data)
        # No debe retornar 422 (Unprocessable Entity) por falta de password
        assert response.status_code != 422, f"No debe requerir password: {response.json()}"
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_crear_usuario_smtp_falla_pero_usuario_se_crea(mock_db):
    """
    Si el SMTP falla, el usuario debe crearse correctamente en la BD.
    Verificación directa sobre el servicio de dominio.
    """
    from app.domain.services.usuario_service import crear_usuario_service
    from app.domain.dto.usuariosDTO import UsuariosIn

    data = UsuariosIn(
        cargo=CargosDisponibles.Analista_personal,
        nombre_1="Luis",
        apellido_1="Ramos",
        email="luis@flujopago.cl",
        rol_id=2,
        rut="11223344-5",
    )

    # Simular que el email NO existe y el RUT NO existe
    mock_result_email = MagicMock()
    mock_result_email.scalar_one_or_none.return_value = None

    mock_result_rut = MagicMock()
    mock_result_rut.scalar_one_or_none.return_value = None

    # Simular el resultado del insert RETURNING
    mock_usuario = MagicMock()
    mock_usuario.id = 20
    mock_usuario.nombre_1 = "Luis"
    mock_usuario.email = "luis@flujopago.cl"

    mock_result_insert = MagicMock()
    mock_result_insert.scalar_one.return_value = mock_usuario

    mock_db.execute = AsyncMock(side_effect=[
        mock_result_email,
        mock_result_rut,
        mock_result_insert,
    ])
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    with patch("app.infrastructure.mailing.email_service.send_email_async", new_callable=AsyncMock) as mock_mail, \
         patch("app.infrastructure.mailing.email_service.generate_temp_password_email_template", return_value="<html></html>"):
        # Simular fallo de SMTP
        mock_mail.return_value = False

        usuario, temp_pw, error = await crear_usuario_service(data, mock_db)

        # El usuario debe haberse creado sin errores a pesar del fallo de correo
        assert error is None
        assert usuario is not None
        assert temp_pw is not None  # Se genera contraseña temporal aunque falle el SMTP
        # El commit de BD debe haberse llamado (usuario persistido)
        mock_db.commit.assert_called_once()


# ===========================================================================
# BLOQUE 3: Restablecimiento de contraseña
# ===========================================================================

@pytest.mark.asyncio
async def test_reset_password_activa_must_change(client, mock_db):
    """
    POST /usuarios/{id}/reset-password debe:
    - Cambiar el hash de la contraseña
    - Activar must_change_password=True
    - Revocar dispositivos de confianza
    - Retornar 200 aunque el correo falle
    """
    mock_usuario = MagicMock(spec=Usuarios)
    mock_usuario.id = 5
    mock_usuario.nombre_1 = "Roberto"
    mock_usuario.email = "roberto@flujopago.cl"
    mock_usuario.hashed_password = "hash_viejo"
    mock_usuario.must_change_password = False
    mock_usuario.mfa_enabled = True
    mock_usuario.mfa_secret_encrypted = "secret"
    mock_usuario.mfa_backup_codes = "codes"
    mock_usuario.mfa_verified_at = datetime.utcnow()

    mock_db.get = AsyncMock(return_value=mock_usuario)
    mock_db.execute = AsyncMock()
    mock_db.commit = AsyncMock()

    with patch("app.infrastructure.mailing.email_service.send_email_async", new_callable=AsyncMock) as mock_mail, \
         patch("app.infrastructure.mailing.email_service.generate_temp_password_email_template", return_value="<html></html>"):
        mock_mail.return_value = True
        response = client.post("/flujopago/gestion-pagos/v1/usuarios/5/reset-password")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    # La contraseña debe haber sido actualizada
    assert mock_usuario.hashed_password != "hash_viejo"
    # must_change_password debe estar activo
    assert mock_usuario.must_change_password is True
    # 2FA desactivado por obligación
    assert mock_usuario.mfa_enabled is False
    assert mock_usuario.mfa_secret_encrypted is None
    assert mock_usuario.mfa_backup_codes is None
    assert mock_usuario.mfa_verified_at is None
    # Los dispositivos deben haberse revocado
    mock_db.execute.assert_called()
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_reset_password_usuario_inexistente(client, mock_db):
    """
    POST /usuarios/999/reset-password debe retornar 404 si el usuario no existe.
    """
    mock_db.get = AsyncMock(return_value=None)
    response = client.post("/flujopago/gestion-pagos/v1/usuarios/999/reset-password")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_reset_password_smtp_falla_no_revierte_bd(client, mock_db):
    """
    Si el SMTP falla al enviar el correo de restablecimiento,
    el cambio en la BD debe persistir igualmente (no hacer rollback).
    """
    mock_usuario = MagicMock(spec=Usuarios)
    mock_usuario.id = 6
    mock_usuario.nombre_1 = "Ana"
    mock_usuario.email = "ana@flujopago.cl"
    mock_usuario.hashed_password = "hash_viejo"
    mock_usuario.must_change_password = False

    mock_db.get = AsyncMock(return_value=mock_usuario)
    mock_db.execute = AsyncMock()
    mock_db.commit = AsyncMock()

    with patch("app.infrastructure.mailing.email_service.send_email_async", new_callable=AsyncMock) as mock_mail, \
         patch("app.infrastructure.mailing.email_service.generate_temp_password_email_template", return_value="<html></html>"):
        # Fallo de SMTP
        mock_mail.return_value = False
        response = client.post("/flujopago/gestion-pagos/v1/usuarios/6/reset-password")

    # El endpoint debe retornar 200 (el cambio en BD ya fue exitoso)
    assert response.status_code == 200
    # El commit debe haberse llamado aunque el correo fallara
    mock_db.commit.assert_called_once()


# ===========================================================================
# BLOQUE 4: Flujo de force-change no se rompe con cambios anteriores
# ===========================================================================

@pytest.mark.asyncio
async def test_force_change_endpoint_funciona(client, mock_db):
    """
    El endpoint POST /password/force-change existente debe seguir
    funcionando correctamente: deshabilitar must_change_password al cambiar.
    """
    from unittest.mock import patch
    from app.infrastructure.security.hashing import hash_password

    # Crear usuario con must_change_password=True
    hashed = hash_password("TempPass-1234")
    mock_usuario = MagicMock(spec=Usuarios)
    mock_usuario.id = 1
    mock_usuario.hashed_password = hashed
    mock_usuario.must_change_password = True

    mock_db.get = AsyncMock(return_value=mock_usuario)
    mock_db.execute = AsyncMock()
    mock_db.commit = AsyncMock()

    payload = {
        "old_password": "TempPass-1234",
        "new_password": "NuevaPass@2026!",
        "confirm_password": "NuevaPass@2026!",
    }

    with patch("app.infrastructure.security.hashing.verify_password", return_value=True):
        response = client.post("/flujopago/gestion-pagos/v1/password/force-change", json=payload)

    assert response.status_code == 200
    # must_change_password debe haberse desactivado
    assert mock_usuario.must_change_password is False


@pytest.mark.asyncio
async def test_force_change_falla_si_not_required(client, mock_db):
    """
    Si un usuario intenta usar force-change cuando must_change_password=False,
    debe retornar error. El response_wrapper de FlujoPago devuelve status='error'
    con HTTP 200 para errores de negocio no críticos.
    """
    mock_usuario = MagicMock(spec=Usuarios)
    mock_usuario.id = 1
    mock_usuario.must_change_password = False

    mock_db.get = AsyncMock(return_value=mock_usuario)

    payload = {
        "old_password": "cualquier",
        "new_password": "NuevaPass@2026!",
        "confirm_password": "NuevaPass@2026!",
    }

    response = client.post("/flujopago/gestion-pagos/v1/password/force-change", json=payload)
    # El response_wrapper de FlujoPago encapsula el error en el JSON con status='error'
    body = response.json()
    assert body["status"] == "error"
    assert "No es necesario" in body["message"]
