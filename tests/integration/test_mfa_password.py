"""
Endpoints 2FA y contraseña:
  GET /mfa/status, POST /mfa/setup, POST /mfa/verify-setup, POST /mfa/send-email-otp, POST /mfa/verify,
  POST /mfa/verify-backup, POST /mfa/disable, GET /mfa/devices, DELETE /mfa/devices/{id},
  POST /password/change, POST /password/force-change
"""
from datetime import datetime, timedelta

import pyotp
import pytest

from app.domain.services.two_factor import decrypt_secret, encrypt_secret, generate_backup_codes
from app.infrastructure.security.jwt_handler import verify_token
from tests.integration.conftest import API, PASSWORD, auth, data_of

NEW_PASS = "Nueva_Clave9#"


def enable_mfa(db, user):
    secret = pyotp.random_base32()
    raw_codes, hashed = generate_backup_codes(3)
    db.execute(
        "UPDATE usuarios SET mfa_enabled=TRUE, mfa_secret_encrypted=%s, mfa_backup_codes=%s WHERE id=%s",
        (encrypt_secret(secret), hashed, user.id),
    )
    return secret, raw_codes


def add_device(db, user, token="dev-1"):
    return db.insert("dispositivos_confianza", {
        "usuario_id": user.id, "device_token": token, "device_name": "Firefox en Linux",
        "created_at": datetime.utcnow(), "expires_at": datetime.utcnow() + timedelta(days=30),
        "last_used_at": datetime.utcnow(),
    })


class TestSetup:
    def test_setup_genera_secreto_cifrado_sin_activar(self, client, users, db):
        r = client.post(f"{API}/mfa/setup", headers=auth(users["ana"], mfa_verified=False))
        assert r.status_code == 200
        d = data_of(r)
        assert d["qr_code_base64"].startswith("data:image/png;base64,") and len(d["backup_codes"]) == 10
        row = db.one("SELECT mfa_enabled, mfa_secret_encrypted, mfa_backup_codes FROM usuarios WHERE id=%s", (users["ana"].id,))
        assert row["mfa_enabled"] is False
        secret = decrypt_secret(row["mfa_secret_encrypted"])
        assert secret in d["provisioning_uri"]          # mismo secreto que el QR
        assert d["backup_codes"][0] not in row["mfa_backup_codes"]  # se guardan hasheados

    def test_setup_con_2fa_activo_400_y_no_rota_secreto(self, client, users, db):
        enable_mfa(db, users["ana"])
        before = db.scalar("SELECT mfa_secret_encrypted FROM usuarios WHERE id=%s", (users["ana"].id,))
        r = client.post(f"{API}/mfa/setup", headers=auth(users["ana"]))
        assert r.status_code == 400
        assert db.scalar("SELECT mfa_secret_encrypted FROM usuarios WHERE id=%s", (users["ana"].id,)) == before

    def test_verify_setup_codigo_valido_activa_y_emite_token_verificado(self, client, users, db):
        client.post(f"{API}/mfa/setup", headers=auth(users["ana"], mfa_verified=False))
        enc = db.scalar("SELECT mfa_secret_encrypted FROM usuarios WHERE id=%s", (users["ana"].id,))
        code = pyotp.TOTP(decrypt_secret(enc)).now()
        r = client.post(f"{API}/mfa/verify-setup", json={"code": code}, headers=auth(users["ana"], mfa_verified=False))
        assert r.status_code == 200
        assert verify_token(data_of(r)["access_token"])["mfa_verified"] is True
        row = db.one("SELECT mfa_enabled, mfa_verified_at FROM usuarios WHERE id=%s", (users["ana"].id,))
        assert row["mfa_enabled"] is True and row["mfa_verified_at"] is not None

    def test_verify_setup_sin_setup_previo_400(self, client, users):
        r = client.post(f"{API}/mfa/verify-setup", json={"code": "123456"}, headers=auth(users["ana"], mfa_verified=False))
        assert r.status_code == 400

    @pytest.mark.parametrize("code", ["12345", "1234567", ""])
    def test_codigo_con_largo_invalido_422(self, client, users, code):
        r = client.post(f"{API}/mfa/verify", json={"code": code}, headers=auth(users["ana"], mfa_verified=False))
        assert r.status_code == 422

    def test_verify_setup_bloquea_tras_5_codigos_invalidos(self, client, users, db):
        client.post(f"{API}/mfa/setup", headers=auth(users["ana"], mfa_verified=False))
        hdr = auth(users["ana"], mfa_verified=False)
        for _ in range(5):
            assert client.post(f"{API}/mfa/verify-setup", json={"code": "000000"}, headers=hdr).status_code == 400
        assert client.post(f"{API}/mfa/verify-setup", json={"code": "000000"}, headers=hdr).status_code == 429
        assert db.scalar("SELECT mfa_enabled FROM usuarios WHERE id=%s", (users["ana"].id,)) is False


class TestVerify:
    def test_totp_valido_200_y_registra_dispositivo_si_se_pidio(self, client, users, db):
        secret, _ = enable_mfa(db, users["ana"])
        hdr = auth(users["ana"], mfa_verified=False, remember_device=True)
        r = client.post(f"{API}/mfa/verify", json={"code": pyotp.TOTP(secret).now()}, headers=hdr)
        assert r.status_code == 200
        assert "trusted_device=" in r.headers.get("set-cookie", "")
        assert db.count("dispositivos_confianza", "usuario_id=%s", (users["ana"].id,)) == 1

    def test_totp_invalido_401_sin_dispositivo(self, client, users, db):
        enable_mfa(db, users["ana"])
        hdr = auth(users["ana"], mfa_verified=False, remember_device=True)
        assert client.post(f"{API}/mfa/verify", json={"code": "000000"}, headers=hdr).status_code == 401
        assert db.count("dispositivos_confianza") == 0

    def test_verify_sin_2fa_habilitado_400(self, client, users):
        assert client.post(f"{API}/mfa/verify", json={"code": "123456"}, headers=auth(users["ana"], mfa_verified=False)).status_code == 400

    def test_otp_por_correo_un_solo_uso_y_rate_limit(self, client, users, db, redis_client):
        enable_mfa(db, users["ana"])
        hdr = auth(users["ana"], mfa_verified=False)
        assert client.post(f"{API}/mfa/send-email-otp", headers=hdr).status_code == 200
        otp = redis_client.get(f"email_otp:{users['ana'].id}")
        assert otp and len(otp) == 6
        assert client.post(f"{API}/mfa/send-email-otp", headers=hdr).status_code == 429   # rate limit 60 s
        assert client.post(f"{API}/mfa/verify", json={"code": otp}, headers=hdr).status_code == 200
        assert redis_client.get(f"email_otp:{users['ana'].id}") is None                   # consumido
        assert client.post(f"{API}/mfa/verify", json={"code": otp}, headers=hdr).status_code == 401

    def test_backup_code_un_solo_uso(self, client, users, db):
        _, codes = enable_mfa(db, users["ana"])
        hdr = auth(users["ana"], mfa_verified=False)
        assert client.post(f"{API}/mfa/verify-backup", json={"backup_code": codes[0]}, headers=hdr).status_code == 200
        assert client.post(f"{API}/mfa/verify-backup", json={"backup_code": codes[0]}, headers=hdr).status_code == 401
        assert client.post(f"{API}/mfa/verify-backup", json={"backup_code": codes[1]}, headers=hdr).status_code == 200


class TestDisable:
    def test_requiere_token_verificado(self, client, users, db):
        secret, _ = enable_mfa(db, users["ana"])
        r = client.post(f"{API}/mfa/disable", json={"code": pyotp.TOTP(secret).now()}, headers=auth(users["ana"], mfa_verified=False))
        assert r.status_code == 403
        assert db.scalar("SELECT mfa_enabled FROM usuarios WHERE id=%s", (users["ana"].id,)) is True

    def test_desactiva_limpia_secretos_y_revoca_dispositivos(self, client, users, db):
        secret, _ = enable_mfa(db, users["ana"])
        add_device(db, users["ana"])
        add_device(db, users["beto"], "dev-beto")
        r = client.post(f"{API}/mfa/disable", json={"code": pyotp.TOTP(secret).now()}, headers=auth(users["ana"]))
        assert r.status_code == 200
        row = db.one("SELECT mfa_enabled, mfa_secret_encrypted, mfa_backup_codes FROM usuarios WHERE id=%s", (users["ana"].id,))
        assert row == {"mfa_enabled": False, "mfa_secret_encrypted": None, "mfa_backup_codes": None}
        assert db.count("dispositivos_confianza", "usuario_id=%s", (users["ana"].id,)) == 0
        assert db.count("dispositivos_confianza", "usuario_id=%s", (users["beto"].id,)) == 1  # no afecta a otros

    @pytest.mark.xfail(strict=True, reason="HALLAZGO H-16: /mfa/disable no aplica rate limit; permite fuerza bruta del TOTP con un token verificado.")
    def test_disable_bloquea_tras_5_codigos_invalidos(self, client, users, db):
        enable_mfa(db, users["ana"])
        for _ in range(5):
            client.post(f"{API}/mfa/disable", json={"code": "000000"}, headers=auth(users["ana"]))
        assert client.post(f"{API}/mfa/disable", json={"code": "000000"}, headers=auth(users["ana"])).status_code == 429


class TestDispositivos:
    def test_lista_solo_los_propios(self, client, users, db):
        add_device(db, users["ana"], "a1")
        add_device(db, users["beto"], "b1")
        r = client.get(f"{API}/mfa/devices", headers=auth(users["ana"]))
        assert r.status_code == 200 and len(data_of(r)) == 1

    def test_no_puede_revocar_dispositivo_ajeno(self, client, users, db):
        dev_beto = add_device(db, users["beto"], "b1")
        assert client.delete(f"{API}/mfa/devices/{dev_beto}", headers=auth(users["ana"])).status_code == 404
        assert db.count("dispositivos_confianza", "id=%s", (dev_beto,)) == 1

    def test_revoca_propio(self, client, users, db):
        dev = add_device(db, users["ana"], "a1")
        assert client.delete(f"{API}/mfa/devices/{dev}", headers=auth(users["ana"])).status_code == 200
        assert db.count("dispositivos_confianza") == 0

    def test_status_refleja_bd(self, client, users, db):
        enable_mfa(db, users["ana"])
        d = data_of(client.get(f"{API}/mfa/status", headers=auth(users["ana"], mfa_verified=False)))
        assert d["mfa_enabled"] is True and d["must_change_password"] is False


class TestPassword:
    def body(self, old=PASSWORD, new=NEW_PASS, confirm=None):
        return {"old_password": old, "new_password": new, "confirm_password": confirm or new}

    def hash_of(self, db, user):
        return db.scalar("SELECT hashed_password FROM usuarios WHERE id=%s", (user.id,))

    def test_cambio_exitoso_persiste_y_revoca_dispositivos(self, client, users, db):
        add_device(db, users["ana"])
        before = self.hash_of(db, users["ana"])
        r = client.post(f"{API}/password/change", json=self.body(), headers=auth(users["ana"]))
        assert r.status_code == 200
        assert self.hash_of(db, users["ana"]) != before
        assert db.count("dispositivos_confianza") == 0
        client.cookies.clear()
        assert client.post(f"{API}/login", json={"email": users["ana"].email, "password": NEW_PASS}).status_code == 200
        assert client.post(f"{API}/login", json={"email": users["ana"].email, "password": PASSWORD}).status_code == 401

    def test_password_actual_incorrecta_400_sin_cambios(self, client, users, db):
        before = self.hash_of(db, users["ana"])
        assert client.post(f"{API}/password/change", json=self.body(old="Otra_Clave1!"), headers=auth(users["ana"])).status_code == 400
        assert self.hash_of(db, users["ana"]) == before

    def test_confirmacion_distinta_400(self, client, users):
        assert client.post(f"{API}/password/change", json=self.body(confirm="Distinta_1!"), headers=auth(users["ana"])).status_code == 400

    @pytest.mark.parametrize("weak", ["corta1!", "sinmayuscula1!", "SinNumero!!", "SinSimbolo123"])
    def test_password_debil_422(self, client, users, weak):
        assert client.post(f"{API}/password/change", json=self.body(new=weak), headers=auth(users["ana"])).status_code == 422

    def test_force_change_no_requerido_400(self, client, users):
        assert client.post(f"{API}/password/force-change", json=self.body(), headers=auth(users["ana"])).status_code == 400

    def test_force_change_requerido_limpia_bandera(self, client, users, db):
        db.execute("UPDATE usuarios SET must_change_password=TRUE WHERE id=%s", (users["ana"].id,))
        r = client.post(f"{API}/password/force-change", json=self.body(), headers=auth(users["ana"], mfa_verified=False))
        assert r.status_code == 200
        assert db.scalar("SELECT must_change_password FROM usuarios WHERE id=%s", (users["ana"].id,)) is False

    def test_sin_autenticacion_401(self, client):
        assert client.post(f"{API}/password/change", json=self.body()).status_code == 401
