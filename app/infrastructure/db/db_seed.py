from sqlalchemy import text
from app.infrastructure.db.database import AsyncSessionLocal
from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.security.hashing import hash_password

logger = setup_logger("DB_SEED")


async def seed_data():
    async with AsyncSessionLocal() as session:
        try:
            # ─── Control de Inicialización Única ─────────────────────────────────────
            # Intentar verificar si ya existe un registro de inicialización en la tabla de control
            try:
                res_init = await session.execute(
                    text("SELECT COUNT(*) FROM db_initialization_log WHERE key = 'db_seed_executed'")
                )
                already_seeded = res_init.scalar()
            except Exception as log_err:
                # Si la tabla no existe por alguna razón, procedemos con la inicialización normal
                logger.warning(f"   → [DB_SEED] No se pudo leer db_initialization_log: {log_err}. Procediendo con verificación estándar...")
                already_seeded = 0

            if already_seeded > 0:
                logger.info("   → [DB_SEED] Base de datos ya inicializada según el log de control. Omitiendo seed...")
                return

            # Estrategia de adopción/retrocompatibilidad para bases de datos ya instaladas:
            # Si el log de control está vacío pero las tablas principales ya contienen datos,
            # registramos retrospectivamente la inicialización y omitimos para no interferir ni duplicar.
            try:
                roles_count = (await session.execute(text("SELECT COUNT(*) FROM roles"))).scalar()
                usuarios_count = (await session.execute(text("SELECT COUNT(*) FROM usuarios"))).scalar()
                if roles_count > 0 or usuarios_count > 0:
                    logger.info("   → [DB_SEED] Se detectaron datos existentes. Registrando inicialización retrospectiva...")
                    await session.execute(
                        text("INSERT INTO db_initialization_log (key) VALUES ('db_seed_executed')")
                    )
                    await session.commit()
                    return
            except Exception as check_err:
                # Ignorar si las tablas aún no están creadas
                pass

            logger.info("=" * 50)
            logger.info("Iniciando seed general (Primera Instalación)".center(50))
            logger.info("=" * 50)

            # ============================
            # 1) PROCESOS
            # ============================
            count = (await session.execute(text("SELECT COUNT(*) FROM procesos"))).scalar()
            if count == 0:
                logger.info("   → Insertando procesos...")
                await session.execute(text("""
                    INSERT INTO procesos (nombre, proceso, cuenta_objeto, auxiliar, estado) VALUES
                    ('REMUNERACIONES', 'PROCESO REMUNERACIONES', '211310', '0010', 'ACTIVO'),
                    ('FINIQUITO', 'PROCESO FINIQUITO', '211310', '0010', 'ACTIVO'),
                    ('ANTICIPO', 'PROCESO ANTICIPO', '110620', '0010', 'ACTIVO'),
                    ('ANTICIPO AGUINALDO', 'PROCESO ANTICIPO', '110620', '0010', 'ACTIVO'),
                    ('ANTICIPO EXTRAORDINARIO', 'PROCESO ANTICIPO EXTRAORDINARIO', '110620', '0010', 'ACTIVO'),
                    ('PRACTICA', 'PROCESO PRACTICA', '411200', '199999', 'ACTIVO'),
                    ('BTN', 'PROCESO BTN', '411700', '99001', 'ACTIVO'),
                    ('EROGACION VOLUNTARIA', 'PROCESO EROGACION VOLUNTARIA', '110610', '0020', 'ACTIVO'),
                    ('PRESTAMO EMPRESA', 'PRESTAMO EMPRESA', '110620', '0020', 'ACTIVO');
                """))
            else:
                logger.info("   → Procesos existentes, omitiendo...")

            # ============================
            # 2) EMPRESAS
            # ============================
            count = (await session.execute(text("SELECT COUNT(*) FROM empresas"))).scalar()
            if count == 0:
                logger.info("   → Insertando empresas...")
                await session.execute(text("""
                    INSERT INTO empresas (empresa, codigo) VALUES
                    ('ANDES', '1001000'),
                    ('CORDILLERA', '2001000'),
                    ('PACIFICO', '3001000');
                """))
            else:
                logger.info("   → Empresas existentes, omitiendo...")

            # ============================
            # 3) ROLES
            # ============================
            count = (await session.execute(text("SELECT COUNT(*) FROM roles"))).scalar()
            if count == 0:
                logger.info("   → Insertando roles...")
                await session.execute(text("""
                    INSERT INTO roles (nombre) VALUES
                    ('Administrador'),
                    ('Solicitante'),
                    ('Aprobador'),
                    ('Responsable Finanzas');
                """))
            else:
                logger.info("   → Roles existentes, omitiendo...")

            # ============================
            # 4) PROCESOS AUXILIARES
            # ============================
            count = (await session.execute(text("SELECT COUNT(*) FROM procesos_auxiliares"))).scalar()
            if count == 0:
                logger.info("   → Insertando procesos auxiliares...")
                await session.execute(text("""
                    INSERT INTO procesos_auxiliares (numero, detalle, auxiliar, estado) VALUES
                    (176, 'OBRA 176', '176', 'ACTIVO'),
                    (196, 'OBRA 196', '196', 'ACTIVO'),
                    (197, 'OBRA 197', '197', 'ACTIVO'),
                    (173, 'OBRA 173', '173', 'ACTIVO'),
                    (198, 'OBRA 198', '198', 'ACTIVO'),
                    (199, 'OBRA 199', '199', 'ACTIVO'),
                    (200, 'OBRA 200', '200', 'ACTIVO'),
                    (201, 'OBRA 201', '201', 'ACTIVO'),
                    (178, 'OBRA 178', '178', 'ACTIVO'),
                    (206, 'OBRA 206', '206', 'ACTIVO'),
                    (204, 'OBRA 204', '204', 'ACTIVO'),

                    ('ROL C', 'ROL C', '010', 'ACTIVO'),
                    ('ROL A', 'ROL A', '010', 'ACTIVO'),
                    ('ROL B', 'ROL B', '010', 'ACTIVO'),
                    ('UMA', 'UMA', '010', 'ACTIVO'),

                    (193, 'OBRA 193', '193', 'ACTIVO'),
                    (202, 'OBRA 202', '202', 'ACTIVO'),
                    (203, 'OBRA 203', '203', 'ACTIVO'),
                    (205, 'OBRA 205', '205', 'ACTIVO'),
                    (18,  'OBRA 018', '018', 'ACTIVO'),
                    ('VUMA', 'VUMA', '010', 'ACTIVO'),
                    (22,  'OBRA 022', '022', 'ACTIVO'),
                    (27,  'OBRA 027', '027', 'ACTIVO'),
                    (43,  'OBRA 043', '043', 'ACTIVO'),
                    (44,  'OBRA 044', '044', 'ACTIVO');
                """))
            else:
                logger.info("   → Procesos auxiliares existentes, omitiendo...")

            # ============================
            # 5) USUARIO ADMIN
            # ============================
            count = (await session.execute(text("SELECT COUNT(*) FROM usuarios"))).scalar()

            if count == 0:
                logger.info("   → Insertando usuario administrador...")
                
                import os
                admin_email = os.getenv("SEED_SUPER_ADMIN_EMAIL", "super_admin@flujopago.cl")
                # [AUDITORÍA H-32] Sin contraseña por defecto en el código: si no se define
                # SEED_SUPER_ADMIN_PASSWORD se genera una aleatoria y se informa UNA sola vez en el log
                # de instalación (solo ocurre al crear la base desde cero).
                admin_password = os.getenv("SEED_SUPER_ADMIN_PASSWORD")
                if not admin_password:
                    import secrets
                    admin_password = secrets.token_urlsafe(18) + "aA1!"
                    logger.warning(
                        f"   → SEED_SUPER_ADMIN_PASSWORD no definida. Contraseña inicial generada para "
                        f"{admin_email}: {admin_password}  (cámbiela tras el primer ingreso)"
                    )

                # =====================================================
                # ✔ Hashear contraseña con Argon2 (misma función global)
                # =====================================================
                hashed_admin_pass = hash_password(admin_password) 

                await session.execute(
                    text("""
                        INSERT INTO usuarios 
                            (cargo, nombre_1, nombres_2, apellido_1, apellido_2, email, hashed_password, rol_id, rut, must_change_password, created_at, updated_at)
                        VALUES 
                            (:cargo, :n1, NULL, :a1, NULL, :email, :pwd, (SELECT id FROM roles WHERE nombre = 'Administrador' LIMIT 1), :rut, FALSE, NOW(), NOW());
                    """),
                    {
                        "cargo": "Administrador",
                        "n1": "Super",
                        "a1": "Administrador",
                        "email": admin_email,
                        "pwd": hashed_admin_pass,
                        "rut": "11111111-1",
                        "created_at": "2025-12-03 11:19:29",
                        "updated_at": "2025-12-03 11:19:29"
                    }
                )
            else:
                logger.info("   → Usuario Super Administrador existente, omitiendo...")

            # 5.1) [AUDITORÍA H-32] Se eliminó el seed del usuario de prueba "Teo" (rol Administrador con
            #      contraseña fija en el código fuente). Las bases existentes se neutralizan en
            #      desactivar_credenciales_de_prueba(), que se ejecuta en cada arranque.

            # ============================
            # 6) TODAS SOLICITUDES
            # ============================
            '''
            count = (await session.execute(text("SELECT COUNT(*) FROM tabla_todas_solicitudes"))).scalar()
            if count == 0:
                logger.info("   → Insertando todas las solicitudes...")
                await session.execute(text("""
                INSERT INTO tabla_todas_solicitudes (
    solicitante,
    fecha_emision,
    fecha_solicitud,
    empresa,
    proceso,
    monto,
    estado,
    reviso,
    fecha_aprobacion,
    mes_de_proceso,
    anio,
    cuenta_contable,
    auxiliar,
    fecha_de_pago,
    unidad_de_negocio,
    glosa,
    observaciones
)
VALUES (
    'Juan Pérez',
    CURRENT_DATE,
    CURRENT_DATE,
    'ANDES',
    'REMUNERACIONES',
    1000000,
    'PENDIENTE',
    'Carlos García',
    CURRENT_DATE,
    'ENERO',
    2026,
    '211310',
    '0010',
    CURRENT_DATE,
    'UMA',
    'Resumen Remuneraciones Enero',
    'Pendiente de revisión inicial'
),
(
    'Juan Pérez',
    CURRENT_DATE,
    CURRENT_DATE,
    'CORDILLERA',
    'FINIQUITO',
    2500000,
    'APROBADO NIVEL 1',
    'Administrador',
    CURRENT_DATE,
    'ENERO',
    2026,
    '211310',
    '0010',
    CURRENT_DATE,
    'ROL A',
    'Finiquito Personal Planta',
    'Aprobado por gerencia'
),
(
    'Ana lópez',
    CURRENT_DATE,
    CURRENT_DATE,
    'PACIFICO',
    'ANTICIPO',
    500000,
    'RECEPCIONADO',
    'Finanzas',
    CURRENT_DATE,
    'ENERO',
    2026,
    '110620',
    '0010',
    CURRENT_DATE,
    'OBRA 176',
    'Anticipos Quincena',
    'Pago procesado exitosamente'
),
(
    'Carlos García',
    CURRENT_DATE,
    CURRENT_DATE,
    'ANDES',
    'PRACTICA',
    150000,
    'RECHAZADO',
    'Administrador',
    CURRENT_DATE,
    'ENERO',
    2026,
    '411200',
    '199999',
    CURRENT_DATE,
    'UMA',
    'Pago Práctica Profesional',
    'Excede presupuesto mensual'
);


                    """))
            else:
                logger.info("   → Todas las solicitudes existentes, omitiendo...")
'''
            # ============================
            # FINALIZAR Y MARCAR INITIALIZACION
            # ============================
            # Registrar la inicialización completada en la tabla de control
            try:
                await session.execute(
                    text("INSERT INTO db_initialization_log (key) VALUES ('db_seed_executed')")
                )
            except Exception as write_err:
                logger.error(f"   → [DB_SEED] Error al guardar registro de inicialización en log: {write_err}")

            await session.commit()
            logger.info("=" * 50)
            logger.info("Seed ejecutado y registrado en log correctamente.".center(50))
            logger.info("=" * 50)

        except Exception as e:
            await session.rollback()
            logger.error(f"===> Error al ejecutar seed: {e}")
            raise


# Cuentas de prueba sembradas por versiones anteriores con contraseña publicada en el código fuente.
# Clave publicada en versiones anteriores, codificada en base64 para no reproducirla en claro.
CUENTAS_PRUEBA_COMPROMETIDAS = {"casa2301teo@gmail.com": __import__("base64").b64decode("QXVyYV9UZXN0MjAyNg==").decode()}


async def desactivar_credenciales_de_prueba() -> int:
    """
    [AUDITORÍA H-32] Neutraliza en bases EXISTENTES las cuentas de prueba sembradas con contraseña conocida.

    Solo actúa si la cuenta conserva exactamente la contraseña publicada (nadie la cambió): reemplaza el hash
    por uno aleatorio, exige cambio de contraseña y revoca dispositivos de confianza. No elimina el usuario
    (puede tener solicitudes asociadas) ni cambia su rol. Es idempotente: se ejecuta en cada arranque.
    Retorna la cantidad de cuentas neutralizadas.
    """
    import secrets
    from app.infrastructure.security.hashing import verify_password

    neutralizadas = 0
    async with AsyncSessionLocal() as session:
        try:
            for email, clave_publicada in CUENTAS_PRUEBA_COMPROMETIDAS.items():
                row = (await session.execute(
                    text("SELECT id, hashed_password FROM usuarios WHERE email = :e"), {"e": email}
                )).first()
                if not row or not verify_password(row.hashed_password, clave_publicada):
                    continue
                await session.execute(
                    text("UPDATE usuarios SET hashed_password = :h, must_change_password = TRUE, "
                         "mfa_enabled = FALSE, mfa_secret_encrypted = NULL, mfa_backup_codes = NULL WHERE id = :id"),
                    {"h": hash_password(secrets.token_urlsafe(32)), "id": row.id},
                )
                await session.execute(text("DELETE FROM dispositivos_confianza WHERE usuario_id = :id"), {"id": row.id})
                neutralizadas += 1
                logger.warning(f"   → [SEGURIDAD] Cuenta de prueba {email} tenía la contraseña publicada: deshabilitada "
                               "(use 'Restablecer contraseña' desde Administración si aún se necesita).")
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"   → [SEGURIDAD] No se pudieron revisar las cuentas de prueba: {e}")
    return neutralizadas
