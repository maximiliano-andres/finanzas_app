"""
Endpoints de usuarios: GET/POST /usuarios, PUT/DELETE /usuarios/{id},
POST /usuarios/{id}/reset-password, POST /usuarios/{id}/send-temp-password
"""
from datetime import datetime, timedelta

import pytest

from tests.integration.conftest import API, PASSWORD, data_of, message_of


def nuevo(**kw):
    body = {
        "cargo": "Analista de personal", "nombre_1": "Carla", "apellido_1": "Diaz",
        "email": "carla@flujopago.cl", "rol_id": 2, "rut": "12345678-5", "obras_ids": [1],
    }
    body.update(kw)
    return body


class TestListar:
    def test_admin_lista_sin_datos_sensibles(self, client, h):
        r = client.get(f"{API}/usuarios", headers=h["admin"])
        assert r.status_code == 200
        lista = data_of(r)
        assert len(lista) == 6
        for u in lista:
            assert not {"hashed_password", "mfa_secret_encrypted", "mfa_backup_codes"} & set(u)
        ana = next(u for u in lista if u["email"] == "ana@flujopago.cl")
        assert ana["rol_nombre"] == "Solicitante" and ana["obras_ids"] == [1]

    def test_solicitante_no_puede_listar_usuarios(self, client, h):
        """HALLAZGO H-05: cualquier usuario autenticado obtenía el padrón completo (emails, RUT, cargos)."""
        assert client.get(f"{API}/usuarios", headers=h["ana"]).status_code == 403

    def test_sin_token_401(self, client):
        assert client.get(f"{API}/usuarios").status_code == 401


class TestCrear:
    def test_crea_con_password_temporal_cambio_obligatorio_y_obras(self, client, h, db):
        r = client.post(f"{API}/usuarios", json=nuevo(), headers=h["admin"])
        assert r.status_code == 200, r.text
        d = data_of(r)
        row = db.one("SELECT id, must_change_password, nombre_1, rut FROM usuarios WHERE email='carla@flujopago.cl'")
        assert row["must_change_password"] is True and row["nombre_1"] == "carla"
        assert db.count("usuarios_obras", "usuario_id=%s", (row["id"],)) == 1
        client.cookies.clear()
        login = client.post(f"{API}/login", json={"email": "carla@flujopago.cl", "password": d["temp_password"]})
        assert login.status_code == 200

    @pytest.mark.parametrize("campo,valor", [("email", "ana@flujopago.cl"), ("rut", "10000002-2")])
    def test_duplicado_400_sin_persistir(self, client, h, db, campo, valor):
        r = client.post(f"{API}/usuarios", json=nuevo(**{campo: valor}), headers=h["admin"])
        assert r.status_code == 400
        assert db.count("usuarios") == 6

    @pytest.mark.parametrize("cambio", [{"rol_id": 999}, {"obras_ids": [999]}])
    def test_referencia_inexistente_no_deja_datos_parciales(self, client, h, db, cambio):
        """El usuario se inserta (flush) antes de las obras: si una FK falla, todo debe revertirse."""
        r = client.post(f"{API}/usuarios", json=nuevo(**cambio), headers=h["admin"])
        assert r.status_code == 400
        assert db.count("usuarios", "email='carla@flujopago.cl'") == 0
        assert db.count("usuarios_obras") == 2

    @pytest.mark.parametrize("cambio", [
        {"email": "carla@gmail.org"}, {"rut": "123"}, {"nombre_1": "C4rla"}, {"cargo": "Gerente"},
        {"rol_id": 0}, {"nombre_1": ""}, {"email": None},
    ])
    def test_validaciones_422(self, client, h, db, cambio):
        assert client.post(f"{API}/usuarios", json=nuevo(**cambio), headers=h["admin"]).status_code == 422
        assert db.count("usuarios") == 6

    @pytest.mark.parametrize("quien", ["ana", "rrhh", "fin"])
    def test_no_admin_403(self, client, h, db, quien):
        assert client.post(f"{API}/usuarios", json=nuevo(), headers=h[quien]).status_code == 403
        assert db.count("usuarios") == 6


class TestModificar:
    def test_actualiza_datos_y_reemplaza_obras(self, client, h, users, db):
        body = nuevo(email="ana2@flujopago.cl", rut="10000002-2", nombre_1="Ana", apellido_1="Perez", obras_ids=[2])
        r = client.put(f"{API}/usuarios/{users['ana'].id}", json=body, headers=h["admin"])
        assert r.status_code == 200
        assert db.scalar("SELECT email FROM usuarios WHERE id=%s", (users["ana"].id,)) == "ana2@flujopago.cl"
        assert [x["obra_id"] for x in db.all("SELECT obra_id FROM usuarios_obras WHERE usuario_id=%s", (users["ana"].id,))] == [2]

    def test_email_de_otro_usuario_400_sin_cambios(self, client, h, users, db):
        """HALLAZGO H-09: el IntegrityError no se manejaba → 500 genérico."""
        body = nuevo(email="beto@flujopago.cl", rut="10000002-2", nombre_1="Ana", apellido_1="Perez", obras_ids=[2])
        r = client.put(f"{API}/usuarios/{users['ana'].id}", json=body, headers=h["admin"])
        assert r.status_code == 400
        assert db.scalar("SELECT email FROM usuarios WHERE id=%s", (users["ana"].id,)) == "ana@flujopago.cl"
        assert db.count("usuarios_obras", "usuario_id=%s AND obra_id=1", (users["ana"].id,)) == 1  # obras intactas

    def test_inexistente_404(self, client, h):
        assert client.put(f"{API}/usuarios/9999", json=nuevo(), headers=h["admin"]).status_code == 404

    def test_no_admin_403_sin_cambios(self, client, h, users, db):
        body = nuevo(email="hack@flujopago.cl", rut="10000002-2", rol_id=1)
        assert client.put(f"{API}/usuarios/{users['ana'].id}", json=body, headers=h["ana"]).status_code == 403
        assert db.scalar("SELECT rol_id FROM usuarios WHERE id=%s", (users["ana"].id,)) == 2


class TestEliminar:
    def test_elimina_y_cascada_de_obras(self, client, h, users, db):
        assert client.delete(f"{API}/usuarios/{users['beto'].id}", headers=h["admin"]).status_code == 200
        assert db.count("usuarios", "id=%s", (users["beto"].id,)) == 0
        assert db.count("usuarios_obras", "usuario_id=%s", (users["beto"].id,)) == 0

    def test_usuario_con_solicitudes_409_y_se_conserva(self, client, h, users, db):
        """HALLAZGO H-10: FK de solicitudes → IntegrityError no manejado → 500 genérico."""
        db.insert_solicitud(usuario_id=users["beto"].id, solicitante="beto rojas", obra="OBRA SUR")
        r = client.delete(f"{API}/usuarios/{users['beto'].id}", headers=h["admin"])
        assert r.status_code == 409
        assert db.count("usuarios", "id=%s", (users["beto"].id,)) == 1

    def test_inexistente_404(self, client, h):
        assert client.delete(f"{API}/usuarios/9999", headers=h["admin"]).status_code == 404

    def test_no_admin_403(self, client, h, users, db):
        assert client.delete(f"{API}/usuarios/{users['beto'].id}", headers=h["ana"]).status_code == 403
        assert db.count("usuarios") == 6


class TestResetYCorreo:
    def test_reset_fuerza_cambio_desactiva_2fa_y_revoca_dispositivos(self, client, h, users, db):
        db.execute("UPDATE usuarios SET mfa_enabled=TRUE, mfa_secret_encrypted='x' WHERE id=%s", (users["ana"].id,))
        db.insert("dispositivos_confianza", {
            "usuario_id": users["ana"].id, "device_token": "d1", "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=1), "last_used_at": datetime.utcnow()})
        r = client.post(f"{API}/usuarios/{users['ana'].id}/reset-password", headers=h["admin"])
        assert r.status_code == 200
        temp = data_of(r)["temp_password"]
        row = db.one("SELECT must_change_password, mfa_enabled, mfa_secret_encrypted FROM usuarios WHERE id=%s", (users["ana"].id,))
        assert row == {"must_change_password": True, "mfa_enabled": False, "mfa_secret_encrypted": None}
        assert db.count("dispositivos_confianza") == 0
        client.cookies.clear()
        assert client.post(f"{API}/login", json={"email": "ana@flujopago.cl", "password": temp}).status_code == 200
        assert client.post(f"{API}/login", json={"email": "ana@flujopago.cl", "password": PASSWORD}).status_code == 401

    def test_reset_no_admin_403(self, client, h, users, db):
        before = db.scalar("SELECT hashed_password FROM usuarios WHERE id=%s", (users["beto"].id,))
        assert client.post(f"{API}/usuarios/{users['beto'].id}/reset-password", headers=h["ana"]).status_code == 403
        assert db.scalar("SELECT hashed_password FROM usuarios WHERE id=%s", (users["beto"].id,)) == before

    def test_reset_inexistente_404(self, client, h):
        assert client.post(f"{API}/usuarios/9999/reset-password", headers=h["admin"]).status_code == 404

    def test_envio_temp_password_ok(self, client, h, users, sent_emails):
        r = client.post(f"{API}/usuarios/{users['ana'].id}/send-temp-password",
                        json={"temp_password": "abcd-1234-ef56", "motivo": "restablecimiento"}, headers=h["admin"])
        assert r.status_code == 200
        assert sent_emails[-1]["to"] == "ana@flujopago.cl" and "abcd-1234-ef56" in sent_emails[-1]["html"]

    def test_envio_fallido_502(self, client, h, users, monkeypatch):
        async def falla(*a, **k):
            return False
        monkeypatch.setattr("app.infrastructure.mailing.email_service.send_email_async", falla)
        r = client.post(f"{API}/usuarios/{users['ana'].id}/send-temp-password", json={"temp_password": "x"}, headers=h["admin"])
        assert r.status_code == 502

    def test_envio_usuario_inexistente_404(self, client, h):
        assert client.post(f"{API}/usuarios/9999/send-temp-password", json={"temp_password": "x"}, headers=h["admin"]).status_code == 404

    def test_envio_no_admin_403(self, client, h, users, sent_emails):
        r = client.post(f"{API}/usuarios/{users['beto'].id}/send-temp-password", json={"temp_password": "phish"}, headers=h["ana"])
        assert r.status_code == 403 and sent_emails == []
