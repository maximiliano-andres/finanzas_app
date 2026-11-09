"""
Endpoints: POST /login, POST /logout, GET /session y control transversal (MFAMiddleware,
get_current_user, ErrorMiddleware) sobre endpoints protegidos.

Cada test documenta: objetivo, precondición (dataset de conftest), acción, resultado HTTP esperado
y estado esperado (BD/Redis/cookies).
"""
from datetime import datetime, timedelta

import jwt
import pytest

from tests.integration.conftest import (
    API, PASSWORD, auth, data_of, expired_token, message_of, token_for,
)
from app.infrastructure.security.jwt_handler import SECRET_KEY, verify_token


def login(client, email, password=PASSWORD, remember=False):
    return client.post(f"{API}/login", json={"email": email, "password": password, "remember_device": remember})


# ---------------------------------------------------------------- /login
class TestLogin:
    def test_credenciales_validas_emiten_token_no_verificado_y_cookie(self, client, users):
        """Login correcto → 200, cookie httpOnly y token con mfa_verified=False (2FA pendiente)."""
        r = login(client, users["ana"].email)
        assert r.status_code == 200
        tokens = data_of(r)
        claims = verify_token(tokens["access_token"])
        assert claims["sub"] == str(users["ana"].id)
        assert claims["rol_nombre"] == "Solicitante"
        assert claims["mfa_verified"] is False
        set_cookie = r.headers.get("set-cookie", "")
        assert "access_token=" in set_cookie and "HttpOnly" in set_cookie

    def test_token_de_primer_factor_no_da_acceso_a_datos(self, client, users):
        """Con solo el primer factor, la API de datos responde 403 + redirect_to 2FA."""
        tok = data_of(login(client, users["ana"].email))["access_token"]
        client.cookies.clear()
        r = client.get(f"{API}/todas_solicitudes", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 403
        assert r.json()["redirect_to"].endswith("/mfa/verify")

    def test_password_incorrecta_401_y_cuenta_intento(self, client, users, redis_client):
        r = login(client, users["ana"].email, "Incorrecta_1!")
        assert r.status_code == 401
        assert redis_client.get(f"login_attempts:{users['ana'].email}:testclient") == "1"
        assert "access_token" not in r.headers.get("set-cookie", "")

    def test_email_inexistente_404(self, client):
        """Comportamiento ACTUAL documentado (HALLAZGO enumeración de usuarios): 404 distinto de 401."""
        r = login(client, "noexiste@flujopago.cl")
        assert r.status_code == 404

    @pytest.mark.parametrize("payload", [
        {},
        {"email": "ana@flujopago.cl"},
        {"password": PASSWORD},
        {"email": None, "password": PASSWORD},
        {"email": "no-es-email", "password": PASSWORD},
        {"email": "ana@dominio-no-permitido.com", "password": PASSWORD},
        {"email": "ana@flujopago.cl", "password": 12345},
    ])
    def test_payload_invalido_422_sin_efectos(self, client, payload, redis_client):
        r = client.post(f"{API}/login", json=payload)
        assert r.status_code == 422
        assert redis_client.keys("login_attempts:*") == []

    def test_bloqueo_tras_5_fallos_incluso_con_password_correcta(self, client, users):
        for _ in range(5):
            assert login(client, users["ana"].email, "Mala_123!").status_code == 401
        r = login(client, users["ana"].email)
        assert r.status_code == 429
        assert "access_token" not in r.headers.get("set-cookie", "")

    def test_bloqueo_es_por_email_no_afecta_a_otros_usuarios(self, client, users):
        for _ in range(5):
            login(client, users["ana"].email, "Mala_123!")
        assert login(client, users["beto"].email).status_code == 200

    def test_login_exitoso_limpia_contador(self, client, users, redis_client):
        for _ in range(3):
            login(client, users["ana"].email, "Mala_123!")
        assert login(client, users["ana"].email).status_code == 200
        assert redis_client.get(f"login_attempts:{users['ana'].email}:testclient") is None

    def test_error_inesperado_no_filtra_detalles_internos(self, client, users, monkeypatch):
        """HALLAZGO: el except genérico de /login devolvía str(e) al cliente (fuga de información)."""
        async def boom(*a, **k):
            raise RuntimeError("password authentication failed for user postgres host 10.0.0.5")
        monkeypatch.setattr("app.interfaces.api.routers.dashboard_routes.login_service", boom)
        r = login(client, users["ana"].email)
        assert r.status_code == 500
        assert "10.0.0.5" not in r.text and "postgres" not in r.text


class TestDispositivoConfianza:
    def _device(self, db, user, days=30):
        token = f"dev-{user.id}-{days}"
        db.insert("dispositivos_confianza", {
            "usuario_id": user.id, "device_token": token, "device_name": "Chrome en macOS",
            "created_at": datetime.utcnow(), "expires_at": datetime.utcnow() + timedelta(days=days),
            "last_used_at": datetime.utcnow() - timedelta(days=1),
        })
        return jwt.encode({"sub": str(user.id), "jti": token, "exp": int((datetime.utcnow() + timedelta(days=30)).timestamp())},
                          SECRET_KEY, algorithm="HS256")

    def test_dispositivo_valido_omite_2fa_y_actualiza_last_used(self, client, users, db):
        cookie = self._device(db, users["ana"])
        client.cookies.set("trusted_device", cookie)
        r = login(client, users["ana"].email)
        assert r.status_code == 200
        assert verify_token(data_of(r)["access_token"])["mfa_verified"] is True
        last = db.scalar("SELECT last_used_at FROM dispositivos_confianza WHERE usuario_id=%s", (users["ana"].id,))
        assert last > datetime.utcnow() - timedelta(minutes=5)

    def test_dispositivo_expirado_no_omite_2fa(self, client, users, db):
        client.cookies.set("trusted_device", self._device(db, users["ana"], days=-1))
        assert verify_token(data_of(login(client, users["ana"].email))["access_token"])["mfa_verified"] is False

    def test_cookie_de_otro_usuario_no_omite_2fa(self, client, users, db):
        client.cookies.set("trusted_device", self._device(db, users["beto"]))
        assert verify_token(data_of(login(client, users["ana"].email))["access_token"])["mfa_verified"] is False

    def test_dispositivo_revocado_no_omite_2fa(self, client, users, db):
        client.cookies.set("trusted_device", self._device(db, users["ana"]))
        db.execute("DELETE FROM dispositivos_confianza")
        assert verify_token(data_of(login(client, users["ana"].email))["access_token"])["mfa_verified"] is False


# ---------------------------------------------------------------- /logout
def test_logout_borra_cookie_de_sesion_y_conserva_dispositivo(client, users):
    login(client, users["ana"].email)
    r = client.post(f"{API}/logout")
    assert r.status_code == 200
    sc = r.headers.get("set-cookie", "")
    assert "access_token=" in sc and ("Max-Age=0" in sc or "expires=" in sc.lower())
    assert "trusted_device" not in sc


# ---------------------------------------------------------------- /session + autenticación transversal
class TestSessionYTokens:
    def test_session_expone_solo_claims_publicos(self, client, users):
        r = client.get(f"{API}/session", headers=auth(users["ana"]))
        assert r.status_code == 200
        d = data_of(r)
        assert d["sub"] == str(users["ana"].id) and d["rol_nombre"] == "Solicitante"
        assert "mfa_verified" not in d and "remember_device" not in d

    def test_sin_token_401(self, client):
        assert client.get(f"{API}/session").status_code == 401

    def test_token_expirado_401(self, client, users):
        r = client.get(f"{API}/session", headers={"Authorization": f"Bearer {expired_token(users['ana'])}"})
        assert r.status_code == 401
        assert "expirado" in message_of(r).lower()

    def test_token_firmado_con_otra_clave_401(self, client, users):
        forged = jwt.encode({"sub": str(users["admin"].id), "rol_nombre": "Administrador", "mfa_verified": True},
                            "otra-clave", algorithm="HS256")
        assert client.get(f"{API}/usuarios", headers={"Authorization": f"Bearer {forged}"}).status_code == 401

    def test_token_alg_none_rechazado(self, client, users):
        forged = jwt.encode({"sub": str(users["admin"].id), "rol_nombre": "Administrador", "mfa_verified": True},
                            None, algorithm="none")
        assert client.get(f"{API}/usuarios", headers={"Authorization": f"Bearer {forged}"}).status_code == 401

    def test_cambio_de_password_pendiente_bloquea_api(self, client, users, db):
        db.execute("UPDATE usuarios SET must_change_password = TRUE WHERE id=%s", (users["ana"].id,))
        r = client.get(f"{API}/todas_solicitudes", headers=auth(users["ana"], mfa_verified=False))
        assert r.status_code == 403
        assert r.json()["redirect_to"].endswith("/password/force-change")

    def test_cookie_de_sesion_es_aceptada_igual_que_bearer(self, client, users):
        client.cookies.set("access_token", token_for(users["ana"]))
        assert client.get(f"{API}/session").status_code == 200

    @pytest.mark.xfail(strict=True, reason="HALLAZGO H-15: los JWT son stateless; un usuario eliminado conserva acceso hasta que expira su token (24 h).")
    def test_token_de_usuario_eliminado_es_rechazado(self, client, users, db):
        tok = auth(users["beto"])
        db.execute("DELETE FROM usuarios_obras WHERE usuario_id=%s", (users["beto"].id,))
        db.execute("DELETE FROM usuarios WHERE id=%s", (users["beto"].id,))
        assert client.get(f"{API}/todas_solicitudes", headers=tok).status_code == 401


def test_cabeceras_de_seguridad_en_api(client, h):
    r = client.get(f"{API}/roles", headers=h["ana"])
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert "default-src 'self'" in r.headers["Content-Security-Policy"]
    assert r.headers["X-Frame-Options"] == "SAMEORIGIN"


def test_rutas_html_heredadas_redirigen_a_la_spa(client, h):
    r = client.get(f"{API}/login", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"].endswith("/app/login")
    r = client.get(f"{API}/dashboard", headers={**h["ana"], "accept": "text/html"}, follow_redirects=False)
    assert r.status_code == 302 and "/app/" in r.headers["location"]


def test_spa_no_sirve_archivos_fuera_de_dist(client):
    r = client.get(f"{API}/app/..%2F..%2F.env")
    assert "SECRET_KEY" not in r.text and "DATABASE_URL" not in r.text
