#!/usr/bin/env python3
"""
test_trusted_device.py
======================
Prueba end-to-end del flujo "Confiar en este dispositivo" (Trusted Device / 2FA Bypass).

Requisitos:
  pip install requests pyotp

Uso:
  python test_trusted_device.py

El script necesita que el servidor FlujoPago esté corriendo localmente en http://localhost:8000
y que las credenciales de prueba sean válidas.
"""

import sys
import time
import requests

# ─── Configuración ────────────────────────────────────────────────────────────

BASE_URL  = "http://localhost:8000"
EMAIL     = "casa2301teo@gmail.com"   # Cambia si usas otro usuario de prueba
PASSWORD  = "@Admin_Flujo2026"         # Cambia a la contraseña real
TOTP_SECRET = None  # Si tienes el secret TOTP ponlo aquí para generar el código automáticamente
                    # Ejemplo: TOTP_SECRET = "JBSWY3DPEHPK3PXP"

# ─── Colores para terminal ─────────────────────────────────────────────────────

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):   print(f"  {GREEN}✓{RESET} {msg}")
def fail(msg): print(f"  {RED}✗{RESET} {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET} {msg}")
def info(msg): print(f"  {BLUE}→{RESET} {msg}")
def header(msg): print(f"\n{BOLD}{BLUE}{'─'*60}{RESET}\n{BOLD} {msg}{RESET}\n{'─'*60}")

errors = []

def assert_ok(condition: bool, description: str):
    if condition:
        ok(description)
    else:
        fail(description)
        errors.append(description)


def get_totp_code():
    if TOTP_SECRET:
        try:
            import pyotp
            return pyotp.TOTP(TOTP_SECRET).now()
        except ImportError:
            warn("pyotp no instalado. Instala con: pip install pyotp")
    return None


def decode_jwt_claim(token: str, claim: str):
    try:
        import base64, json
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        return payload.get(claim)
    except Exception:
        return None


# ─── TEST 1: Login con remember_device=True ───────────────────────────────────

header("TEST 1: Login con 'Confiar en este dispositivo' = True")

session1 = requests.Session()
login_resp = session1.post(f"{BASE_URL}/flujopago/gestion-pagos/v1/login", json={
    "email": EMAIL,
    "password": PASSWORD,
    "remember_device": True
})

assert_ok(login_resp.status_code == 200, f"Login retorna 200 (actual: {login_resp.status_code})")
login_data = login_resp.json()
assert_ok(login_data.get("status") == "success", "Login responde status=success")

access_token = login_data.get("data", {}).get("access_token")
assert_ok(bool(access_token), "Login devuelve access_token")

if access_token:
    remember_in_token = decode_jwt_claim(access_token, "remember_device")
    assert_ok(remember_in_token == True,
              f"JWT contiene remember_device=True (actual: {remember_in_token})")
    mfa_verified_initial = decode_jwt_claim(access_token, "mfa_verified")
    info(f"mfa_verified en token inicial: {mfa_verified_initial}")


# ─── TEST 2: Cookie trusted_device al momento del login ───────────────────────

header("TEST 2: Verificar cookie trusted_device al momento del login")

cookie_access = session1.cookies.get("access_token")
assert_ok(bool(cookie_access), "Cookie access_token seteada después del login")

cookie_trusted = session1.cookies.get("trusted_device")
SKIP_MFA_VERIFY = False
if cookie_trusted:
    ok("Cookie trusted_device presente → bypass por dispositivo previo")
    mfa_bypass = decode_jwt_claim(access_token, "mfa_verified")
    assert_ok(mfa_bypass == True,
              f"Token tiene mfa_verified=True (bypass activo) (actual: {mfa_bypass})")
    SKIP_MFA_VERIFY = True
else:
    warn("No hay cookie trusted_device → se necesita verificar 2FA")


# ─── TEST 3: Verificar 2FA ─────────────────────────────────────────────────────

if not SKIP_MFA_VERIFY:
    header("TEST 3: Verificar 2FA con remember_device en el token")

    totp_code = get_totp_code()
    if not totp_code:
        warn("No hay TOTP_SECRET configurado. Ingresa el código manualmente:")
        totp_code = input("  Código TOTP (6 dígitos): ").strip()

    verify_resp = session1.post(
        f"{BASE_URL}/flujopago/gestion-pagos/v1/mfa/verify",
        json={"code": totp_code},
        headers={"Authorization": f"Bearer {access_token}"}
    )

    assert_ok(verify_resp.status_code == 200,
              f"Verify retorna 200 (actual: {verify_resp.status_code})")
    verify_data = verify_resp.json()
    assert_ok(verify_data.get("status") == "success",
              "Verify responde status=success")

    new_token = verify_data.get("data", {}).get("access_token")
    if new_token:
        access_token = new_token
        mfa_verified_claim = decode_jwt_claim(new_token, "mfa_verified")
        assert_ok(mfa_verified_claim == True,
                  f"Nuevo token tiene mfa_verified=True (actual: {mfa_verified_claim})")

    time.sleep(0.3)
    cookie_trusted_after = session1.cookies.get("trusted_device")
    assert_ok(bool(cookie_trusted_after),
              "Cookie trusted_device seteada después de verificar 2FA [BUG FIX credentials:include]")
    if cookie_trusted_after:
        info(f"Cookie trusted_device = {cookie_trusted_after[:50]}...")
    else:
        fail("La cookie trusted_device NO fue seteada en el navegador")
else:
    header("TEST 3: OMITIDO (dispositivo ya era confiable)")
    ok("Bypass de 2FA ya activo — dispositivo reconocido correctamente")


# ─── TEST 4: Dispositivo en la DB ─────────────────────────────────────────────

header("TEST 4: Dispositivo aparece en la lista de dispositivos confiados")

devices_resp = session1.get(
    f"{BASE_URL}/flujopago/gestion-pagos/v1/mfa/devices",
    headers={"Authorization": f"Bearer {access_token}"}
)
assert_ok(devices_resp.status_code == 200,
          f"GET /flujopago/gestion-pagos/v1/mfa/devices retorna 200 (actual: {devices_resp.status_code})")
devices = devices_resp.json()
assert_ok(isinstance(devices, list) and len(devices) > 0,
          f"Al menos 1 dispositivo registrado (actual: {len(devices) if isinstance(devices, list) else 'error'})")
if isinstance(devices, list) and len(devices) > 0:
    d = devices[0]
    info(f"Dispositivo: {d.get('device_name')} — expira: {d.get('expires_at')}")


# ─── TEST 5: Logout NO borra el dispositivo de la DB ─────────────────────────

header("TEST 5: Logout — el dispositivo confiado debe PERSISTIR en la DB")

logout_resp = session1.post(f"{BASE_URL}/flujopago/gestion-pagos/v1/logout")
assert_ok(logout_resp.status_code == 200,
          f"Logout retorna 200 (actual: {logout_resp.status_code})")
info("El servidor ya NO borra el dispositivo de la DB en logout (fix aplicado)")

# Confirmar que el dispositivo sigue en la DB usando un nuevo login temporal
session_check = requests.Session()
# Copiamos la cookie trusted_device a la nueva sesión para simular un nuevo navegador con la cookie
if session1.cookies.get("trusted_device"):
    session_check.cookies.set("trusted_device", session1.cookies.get("trusted_device"))

login_check_resp = session_check.post(f"{BASE_URL}/flujopago/gestion-pagos/v1/login", json={
    "email": EMAIL, "password": PASSWORD, "remember_device": False
})
token_check = login_check_resp.json().get("data", {}).get("access_token", "")
mfa_verified_check = decode_jwt_claim(token_check, "mfa_verified")
assert_ok(mfa_verified_check == True,
          f"Dispositivo persiste después del logout: mfa_verified={mfa_verified_check} [BUG FIX logout]")


# ─── TEST 6: Segundo login real — bypass de 2FA ────────────────────────────────

header("TEST 6: Segundo login — debe bypassear el 2FA automáticamente")

session2 = requests.Session()
# Transferir la cookie trusted_device que debería persistir en el navegador real
if session1.cookies.get("trusted_device"):
    session2.cookies.set("trusted_device", session1.cookies.get("trusted_device"))

login2_resp = session2.post(f"{BASE_URL}/flujopago/gestion-pagos/v1/login", json={
    "email": EMAIL,
    "password": PASSWORD,
    "remember_device": False
})
assert_ok(login2_resp.status_code == 200,
          f"Segundo login retorna 200 (actual: {login2_resp.status_code})")

token2 = login2_resp.json().get("data", {}).get("access_token")
if token2:
    mfa_verified2 = decode_jwt_claim(token2, "mfa_verified")
    assert_ok(mfa_verified2 == True,
              f"Segundo login tiene mfa_verified=True (bypass funcionó!) (actual: {mfa_verified2})")
    if mfa_verified2:
        ok("✅ BYPASS DE 2FA FUNCIONANDO CORRECTAMENTE")
    else:
        fail("❌ El bypass NO funcionó — se requeriría 2FA de nuevo")
else:
    fail("No se recibió token en el segundo login")


# ─── TEST 7: Dashboard accesible ──────────────────────────────────────────────

header("TEST 7: Acceso al dashboard con token bypasado")

dashboard_resp = session2.get(f"{BASE_URL}/flujopago/gestion-pagos/v1/dashboard")
assert_ok(dashboard_resp.status_code in [200, 307, 302],
          f"Dashboard accesible (status: {dashboard_resp.status_code})")


# ─── Resumen Final ─────────────────────────────────────────────────────────────

header("RESUMEN DE PRUEBAS")

if errors:
    print(f"\n{RED}{BOLD}FALLARON {len(errors)} prueba(s):{RESET}")
    for e in errors:
        print(f"  {RED}✗{RESET} {e}")
    print(f"\n{YELLOW}Revisa los logs del servidor para más detalles.{RESET}")
    sys.exit(1)
else:
    print(f"\n{GREEN}{BOLD}✅ TODAS LAS PRUEBAS PASARON{RESET}")
    print(f"{GREEN}El flujo 'Confiar en este dispositivo' funciona correctamente al 100%.{RESET}")
    sys.exit(0)
