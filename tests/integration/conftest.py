"""
Infraestructura de pruebas de INTEGRACIÓN REAL del backend.

A diferencia de app/tests (que usa una sesión de BD mockeada), estas pruebas ejecutan la
aplicación FastAPI completa (middlewares, dependencias, servicios) contra:
  - PostgreSQL real y AISLADO (TEST_DATABASE_URL; el nombre de la BD debe contener "test").
  - Redis real y aislado (TEST_REDIS_URL).

Garantías de aislamiento por test:
  - Todas las tablas de la app se truncan y se re-siembran con un dataset determinista.
  - Redis se vacía (FLUSHDB).
  - Las cookies del cliente se limpian.
  - Los archivos creados en doc_pdf/, PDF_firmados/ y PDF_autorizaciones/ se eliminan.
  - El envío de correos se reemplaza por un doble que registra las llamadas (nunca sale SMTP).

Ejecución recomendada: scripts/run_backend_tests.sh (levanta Postgres/Redis efímeros en Docker).
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://flujopago_test:flujopago_test_pass@127.0.0.1:55433/flujopago_test"
)
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://:redis_test_pass@127.0.0.1:56380/0")

# --- Guardia de seguridad: jamás truncar una BD que no sea de pruebas ---
_db_name = urlparse(TEST_DATABASE_URL.replace("+asyncpg", "")).path.lstrip("/")
if "test" not in _db_name.lower():
    raise RuntimeError(f"TEST_DATABASE_URL debe apuntar a una BD de pruebas (nombre actual: '{_db_name}').")

# Variables de entorno ANTES de importar la app (el engine y los secretos se leen al importar).
os.environ.update(
    {
        "DATABASE_URL": TEST_DATABASE_URL,
        "REDIS_URL": TEST_REDIS_URL,
        "SECRET_KEY": "integration-tests-only-secret-key-0123456789abcdef",
        "JWT_ALGORITHM": "HS256",
        "FERNET_KEY": "vd_Hi0om8BdCLGZPWSfyXO9uWIj4yRCDzj2CLB4BqNw=",
        # SMTP inalcanzable: aunque el doble de correo fallara, nunca saldría un correo real.
        "SMTP_HOST": "127.0.0.1",
        "SMTP_PORT": "1",
        "SMTP_USER": "",
        "SMTP_PASSWORD": "",
        "SEED_SUPER_ADMIN_EMAIL": "super_admin@flujopago.cl",
        "SEED_SUPER_ADMIN_PASSWORD": "@Admin_Flujo2026",
        "LOGIN_MAX_ATTEMPTS": "5",
        "MFA_MAX_ATTEMPTS": "5",
        "DB_POOL_SIZE": "5",
        "DB_MAX_OVERFLOW": "5",
        "DB_ECHO": "False",
        "APP_ENV": "test",
    }
)

import psycopg  # noqa: E402
import redis as redis_sync  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.infrastructure.security.hashing import hash_password  # noqa: E402
from app.infrastructure.security.jwt_handler import create_access_token, create_token  # noqa: E402

SYNC_DSN = TEST_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
API = "/flujopago/gestion-pagos/v1"
PASSWORD = "Clave_Segura1!"
PDF_DIRS = ("doc_pdf", "PDF_firmados", "PDF_autorizaciones")

APP_TABLES = [
    "dispositivos_confianza",
    "usuarios_obras",
    "tabla_historico",
    "tabla_recepcionados",
    "tabla_todas_solicitudes",
    "usuarios",
    "procesos_auxiliares",
    "procesos",
    "empresas",
    "roles",
]


# ---------------------------------------------------------------------------
# Acceso directo (síncrono) a la BD para preparar datos y VERIFICAR persistencia
# ---------------------------------------------------------------------------
class DB:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def _conn(self):
        return psycopg.connect(self.dsn, autocommit=True)

    def execute(self, sql: str, params: dict | tuple | None = None) -> None:
        with self._conn() as c:
            c.execute(sql, params)

    def one(self, sql: str, params: dict | tuple | None = None) -> dict | None:
        with self._conn() as c:
            cur = c.execute(sql, params)
            row = cur.fetchone()
            if row is None:
                return None
            return dict(zip([d.name for d in cur.description], row))

    def all(self, sql: str, params: dict | tuple | None = None) -> list[dict]:
        with self._conn() as c:
            cur = c.execute(sql, params)
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]

    def scalar(self, sql: str, params: dict | tuple | None = None):
        with self._conn() as c:
            row = c.execute(sql, params).fetchone()
            return row[0] if row else None

    def count(self, table: str, where: str = "TRUE", params: dict | tuple | None = None) -> int:
        return self.scalar(f"SELECT COUNT(*) FROM {table} WHERE {where}", params)

    # ---- fábricas de datos ----
    def insert(self, table: str, values: dict) -> int:
        cols = ", ".join(values)
        ph = ", ".join(f"%({k})s" for k in values)
        with self._conn() as c:
            return c.execute(f"INSERT INTO {table} ({cols}) VALUES ({ph}) RETURNING id", values).fetchone()[0]

    def insert_solicitud(self, table: str = "tabla_todas_solicitudes", **overrides) -> int:
        values = solicitud_row(**overrides)
        if table == "tabla_recepcionados":
            values.setdefault("estado", "RECEPCIONADO")
        return self.insert(table, values)


def solicitud_row(**overrides) -> dict:
    """Fila mínima válida (todas las columnas NOT NULL) para solicitudes/recepcionados."""
    base = {
        "usuario_id": None,
        "solicitante": "ana perez",
        "fecha_emision": date.today(),
        "fecha_solicitud": date.today(),
        "empresa": "ANDES",
        "obra": "OBRA NORTE",
        "proceso": "REMUNERACIONES",
        "monto": 1000,
        "estado": "ESPERANDO",
        "reviso": "Jefe de Recursos Humanos",
        "mes_de_proceso": "NOVIEMBRE",
        "anio": 2026,
        "cuenta_contable": "211310",
        "auxiliar": "0010",
        "fecha_de_pago": date.today() + timedelta(days=10),
        "unidad_de_negocio": "UNE-1",
        "folio": "F-1000",
        "folio_uno": "F-1000",
        "monto_por_folio_uno": 1000,
        "tipo_solicitud": "Mis Solicitudes",
        "modificacion_solicitud": False,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Usuarios del dataset determinista
# ---------------------------------------------------------------------------
@dataclass
class User:
    key: str
    id: int
    email: str
    rol: str
    rol_id: int
    cargo: str
    nombre_1: str
    apellido_1: str
    rut: str

    @property
    def full_name(self) -> str:
        return f"{self.nombre_1} {self.apellido_1}"


ROLES = {"Administrador": 1, "Solicitante": 2, "Aprobador": 3, "Responsable Finanzas": 4}

USERS_SPEC = [
    # key, email, rol, cargo, nombre, apellido, rut, obras
    ("admin", "admin@flujopago.cl", "Administrador", "Administrador", "adela", "admin", "10000001-1", []),
    ("ana", "ana@flujopago.cl", "Solicitante", "Analista de personal", "ana", "perez", "10000002-2", ["OBRA NORTE"]),
    ("beto", "beto@flujopago.cl", "Solicitante", "Analista de personal", "beto", "rojas", "10000003-3", ["OBRA SUR"]),
    ("rrhh", "rrhh@flujopago.cl", "Aprobador", "Jefe de Recursos Humanos", "rita", "rrhh", "10000004-4", []),
    ("fin", "fin@flujopago.cl", "Responsable Finanzas", "Jefe de Finanzas", "fede", "finanzas", "10000005-5", []),
    ("sinobra", "sinobra@flujopago.cl", "Solicitante", "Analista de personal", "sara", "sinobra", "10000006-6", []),
]
OBRAS = {"OBRA NORTE": 1, "OBRA SUR": 2}


@pytest.fixture(scope="session")
def db() -> DB:
    return DB(SYNC_DSN)


@pytest.fixture(scope="session")
def password_hash() -> str:
    return hash_password(PASSWORD)  # Argon2 real (una vez por sesión: es costoso)


@pytest.fixture(scope="session")
def client():
    """Cliente único por sesión: el lifespan real crea tablas, ejecuta migraciones, seed y Redis."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def redis_client():
    r = redis_sync.Redis.from_url(TEST_REDIS_URL, decode_responses=True)
    yield r
    r.close()


def _snapshot_files() -> set[Path]:
    files = set()
    for base in {ROOT, Path.cwd()}:
        for d in PDF_DIRS:
            p = base / d
            if p.exists():
                files |= {f.resolve() for f in p.iterdir() if f.is_file()}
    return files


@pytest.fixture(autouse=True)
def isolated_state(client, db, redis_client, password_hash, monkeypatch):
    """Estado limpio y determinista por test + limpieza de archivos y correos."""
    # 1) BD
    db.execute("SET lock_timeout = '5s'")
    db.execute(f"TRUNCATE {', '.join(APP_TABLES)} RESTART IDENTITY CASCADE")
    for nombre, rid in ROLES.items():
        db.execute("INSERT INTO roles (id, nombre) VALUES (%s, %s)", (rid, nombre))
    db.execute("INSERT INTO empresas (empresa, codigo) VALUES ('ANDES', '1001000'), ('CORDILLERA', '2001000')")
    db.execute(
        "INSERT INTO procesos (nombre, proceso, cuenta_objeto, auxiliar, estado) "
        "VALUES ('REMUNERACIONES', 'PROCESO REMUNERACIONES', '211310', '0010', 'ACTIVO')"
    )
    for nombre, oid in OBRAS.items():
        db.execute(
            "INSERT INTO procesos_auxiliares (id, numero, detalle, auxiliar, estado) VALUES (%s, %s, %s, %s, 'ACTIVO')",
            (oid, f"N-{oid}", nombre, f"0{oid}0"),
        )
    db.execute("SELECT setval('procesos_auxiliares_id_seq', 100)")
    db.execute("SELECT setval('roles_id_seq', 100)")
    for key, email, rol, cargo, n1, a1, rut, obras in USERS_SPEC:
        uid = db.insert(
            "usuarios",
            {
                "cargo": cargo, "nombre_1": n1, "apellido_1": a1, "email": email,
                "hashed_password": password_hash, "rol_id": ROLES[rol], "rut": rut,
                "mfa_enabled": False, "must_change_password": False,
                "created_at": datetime.utcnow(), "updated_at": datetime.utcnow(),
            },
        )
        for o in obras:
            db.execute("INSERT INTO usuarios_obras (usuario_id, obra_id) VALUES (%s, %s)", (uid, OBRAS[o]))
    # 2) Redis
    redis_client.flushdb()
    # 3) Cookies
    client.cookies.clear()
    # 4) Correos: doble que registra (send_email_async se importa por nombre en mfa_routes)
    sent: list[dict] = []

    async def fake_send(to_email, subject, html_content, *args, **kwargs):
        sent.append({"to": to_email, "subject": subject, "html": html_content})
        return True

    monkeypatch.setattr("app.infrastructure.mailing.email_service.send_email_async", fake_send)
    monkeypatch.setattr("app.interfaces.api.routers.mfa_routes.send_email_async", fake_send)
    # 5) Archivos
    before = _snapshot_files()
    yield SimpleNamespace(sent_emails=sent)
    for f in _snapshot_files() - before:
        f.unlink(missing_ok=True)


@pytest.fixture
def sent_emails(isolated_state):
    return isolated_state.sent_emails


@pytest.fixture
def users(db) -> dict[str, User]:
    rows = db.all(
        "SELECT u.id, u.email, u.cargo, u.nombre_1, u.apellido_1, u.rut, u.rol_id, r.nombre AS rol "
        "FROM usuarios u JOIN roles r ON r.id = u.rol_id"
    )
    by_email = {r["email"]: r for r in rows}
    out = {}
    for key, email, *_ in USERS_SPEC:
        r = by_email[email]
        out[key] = User(key, r["id"], email, r["rol"], r["rol_id"], r["cargo"], r["nombre_1"], r["apellido_1"], r["rut"])
    return out


def token_for(user: User, mfa_verified: bool = True, remember_device: bool = False) -> str:
    """Token emitido por la función REAL de la app (mismos claims que /login)."""
    u = SimpleNamespace(
        id=user.id, email=user.email, nombre_1=user.nombre_1, nombres_2=None, apellido_1=user.apellido_1,
        apellido_2=None, rol_id=user.rol_id, rut=user.rut, rol=SimpleNamespace(nombre=user.rol), cargo=user.cargo,
    )
    return create_access_token(u, remember_device=remember_device, mfa_verified=mfa_verified)


def auth(user: User, **kw) -> dict:
    return {"Authorization": f"Bearer {token_for(user, **kw)}"}


@pytest.fixture
def h(users):
    """Headers de autenticación (2FA ya verificado) por clave de usuario: h['ana']."""
    return {k: auth(u) for k, u in users.items()}


def make_pdf_bytes(pages: int = 1) -> bytes:
    import pikepdf

    pdf = pikepdf.new()
    for _ in range(pages):
        pdf.add_blank_page()
    buf = BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def expired_token(user: User) -> str:
    claims = {"sub": str(user.id), "email": user.email, "rol_nombre": user.rol, "mfa_verified": True}
    return create_token(claims, -10)


def data_of(resp) -> object:
    """Extrae `data` del sobre estándar {status, code, data,...} que agrega ResponseWrapperMiddleware."""
    body = resp.json()
    return body.get("data", body) if isinstance(body, dict) else body


def message_of(resp) -> str:
    body = resp.json()
    return str(body.get("detail") or body.get("message") or "")
