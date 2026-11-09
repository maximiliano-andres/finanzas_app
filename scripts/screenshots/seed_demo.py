"""
Datos de demostración para las capturas del README (empresas y personas ficticias).

Se ejecuta DESPUÉS de que la app arrancó una vez contra una BD vacía (el lifespan crea tablas y el seed
maestro: roles, procesos y empresas ANDES/CORDILLERA/PACIFICO). Imprime en la última línea un JWT de la
usuaria administradora con el 2FA ya verificado, que el script de Playwright usa como cookie de sesión.

Uso (dentro de la imagen de la app): DATABASE_URL=... SECRET_KEY=... python scripts/screenshots/seed_demo.py
"""
import os
import sys
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import psycopg  # noqa: E402

from app.infrastructure.security.hashing import hash_password  # noqa: E402
from app.infrastructure.security.jwt_handler import create_access_token  # noqa: E402

DSN = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")

OBRAS = [("210", "PLANTA NORTE"), ("211", "BODEGA CENTRAL"), ("212", "OFICINA SANTIAGO"), ("213", "FAENA SUR")]
# id, solicitante, empresa, proceso, estado, reviso, día de noviembre, auxiliar, monto, forma de pago
SOLICITUDES = [
    (1040, "Camila Rojas", "ANDES", "REMUNERACIONES", "PENDIENTE", "Jefe de Recursos Humanos", 3, "210", 4850000, "VALE VISTA"),
    (1041, "Diego Fuentes", "ANDES", "FINIQUITO", "PENDIENTE", "Jefe de Recursos Humanos", 4, "211", 1320000, "DEPOSITO"),
    (1042, "Valentina Soto", "CORDILLERA", "REMUNERACIONES", "PENDIENTE", "Jefe de Recursos Humanos", 5, "212", 2975000, "DEPOSITO"),
    (1043, "Tomás Vergara", "ANDES", "PRESTAMO EMPRESA", "APROBADO NIVEL 1", "Subgerente de Capital Humano", 2, "213", 650000, "DEPOSITO"),
    (1044, "Matías Herrera", "PACIFICO", "BTN", "APROBADO NIVEL 1", "Subgerente de Capital Humano", 1, "211", 410000, "VALE VISTA"),
    (1045, "Tomás Vergara", "ANDES", "ANTICIPO AGUINALDO", "APROBADO NIVEL 2", "Jefe de Finanzas", 8, "211", 300000, "DEPOSITO"),
    (1046, "Camila Rojas", "ANDES", "FINIQUITO", "APROBADO NIVEL 2", "Jefe de Finanzas", 3, "212", 2140000, "DEPOSITO"),
    (1047, "Diego Fuentes", "ANDES", "REMUNERACIONES", "APROBADO FINANZAS", "Jefe de Finanzas", 4, "213", 5230000, "VALE VISTA"),
    (1048, "Valentina Soto", "ANDES", "BTN", "RECHAZADO", "Sin Asignar", 5, "210", 380000, "DEPOSITO"),
    (1049, "Matías Herrera", "PACIFICO", "ANTICIPO", "PENDIENTE", "Jefe de Recursos Humanos", 6, "211", 900000, "DEPOSITO"),
]


def main() -> None:
    with psycopg.connect(DSN, autocommit=True) as c:
        codigos = dict(c.execute("SELECT empresa, codigo FROM empresas").fetchall())
        cuentas = dict(c.execute("SELECT nombre, cuenta_objeto FROM procesos").fetchall())
        rol_admin = c.execute("SELECT id FROM roles WHERE nombre = 'Administrador'").fetchone()[0]

        c.execute("DELETE FROM tabla_todas_solicitudes")
        for aux, detalle in OBRAS:
            c.execute("INSERT INTO procesos_auxiliares (numero, detalle, auxiliar, estado) "
                      "VALUES (%s, %s, %s, 'ACTIVO') ON CONFLICT DO NOTHING", (f"N-{aux}", detalle, aux))
        obra_por_aux = dict(OBRAS)

        admin = c.execute(
            "INSERT INTO usuarios (cargo, nombre_1, apellido_1, email, hashed_password, rol_id, rut, mfa_enabled, "
            "must_change_password, created_at, updated_at) VALUES ('Administrador', 'andrea', 'morales', "
            "'andrea.morales@flujopago.cl', %s, %s, '15111222-3', FALSE, FALSE, now(), now()) "
            "ON CONFLICT (email) DO UPDATE SET nombre_1 = EXCLUDED.nombre_1 RETURNING id",
            (hash_password("Demo_Captura2026!"), rol_admin)).fetchone()[0]

        for (sid, nombre, empresa, proceso, estado, reviso, dia, aux, monto, forma) in SOLICITUDES:
            folio = f"47{sid:04d}{dia:02d}00"
            c.execute(
                "INSERT INTO tabla_todas_solicitudes (id, usuario_id, solicitante, fecha_emision, fecha_solicitud, "
                "empresa, obra, proceso, monto, estado, reviso, mes_de_proceso, anio, cuenta_contable, auxiliar, "
                "fecha_de_pago, unidad_de_negocio, glosa, folio, folio_uno, monto_por_folio_uno, forma_pago_folio_uno, "
                "tipo_solicitud, modificacion_solicitud) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
                "'NOVIEMBRE', 2026, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Mis Solicitudes', FALSE)",
                (sid, admin, nombre, date(2026, 11, dia), date(2026, 11, dia), empresa, obra_por_aux[aux], proceso,
                 monto, estado, reviso, cuentas.get(proceso, "211310"), aux, date(2026, 11, min(dia + 11, 28)),
                 f"{codigos[empresa]}{aux}", f"{empresa} - {proceso}"[:50], folio, folio, monto, forma))
        c.execute("SELECT setval('tabla_todas_solicitudes_id_seq', 1100)")

    user = SimpleNamespace(id=admin, email="andrea.morales@flujopago.cl", nombre_1="andrea", nombres_2=None,
                           apellido_1="morales", apellido_2=None, rol_id=rol_admin, rut="15111222-3",
                           rol=SimpleNamespace(nombre="Administrador"), cargo="Administrador")
    print(create_access_token(user, mfa_verified=True))


if __name__ == "__main__":
    main()
