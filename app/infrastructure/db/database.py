import os
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    AsyncEngine,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from sqlalchemy import text

from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.security.auth_token_roles import get_current_user

logger = setup_logger("DATABASE")

# Cargar variables del archivo .env (si existe)
load_dotenv()

# Valores por defecto (solo para desarrollo local). En producción usa env vars o secret manager.
DEFAULT_DB_USER = os.getenv("DB_USER", "postgres")
DEFAULT_DB_PASS = os.getenv("DB_PASS", "postgres")
DEFAULT_DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DEFAULT_DB_PORT = os.getenv("DB_PORT", "5432")
DEFAULT_DB_NAME = os.getenv("DB_NAME", "flujopago_db")

# Si tu contraseña contiene caracteres especiales, pásala URL-encoded en DATABASE_URL
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql+asyncpg://{DEFAULT_DB_USER}:{DEFAULT_DB_PASS}@{DEFAULT_DB_HOST}:{DEFAULT_DB_PORT}/{DEFAULT_DB_NAME}"
)

# Pool config desde env (fallbacks seguros)
def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except Exception:
        return default

DB_POOL_SIZE = _env_int("DB_POOL_SIZE", 5)
DB_MAX_OVERFLOW = _env_int("DB_MAX_OVERFLOW", 10)
DB_ECHO = os.getenv("DB_ECHO", "False").lower() in ("1", "true", "yes")

# ======================================
# 🚀 Motor Optimizado (compatible SQLAlchemy >=2.0)
# ======================================
# NOTE: en contenedores pequeños, usar pool pequeño. Si tienes picos, aumenta pool_size.
# Para evitar problemas en entornos con forking o Windows, se puede usar NullPool, pero aquí
# dejamos QueuePool por defecto con parámetros controlados.
engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=DB_ECHO,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=1800,
    # connect_args se pasa tal cual al driver asyncpg; si necesitas parámetros específicos ponlos aquí.
    connect_args={"statement_cache_size": 100},
)

# Session factory (SQLAlchemy 2.0 style)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    class_=AsyncSession,
)

# Base para los modelos
Base = declarative_base()


# ======================================
# 🧱 Dependency: Session por request (FastAPI)
# ======================================
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency para FastAPI: yield session, commit si todo ok, rollback en excepción.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session

        except Exception as e:
            await session.rollback()
            logger.error("=" * 50)
            logger.error(f"Error en sesión DB: {e}")
            logger.error("=" * 50)
            raise


# ======================================
# 🧱 Crear tablas en el startup de la app
# ======================================
async def init_db():
    """
    Ejecutar en el startup event de FastAPI para crear tablas (si no existen).
    """
    try:
        async with engine.begin() as conn:
            # Migración de nombre heredado: versiones anteriores llamaban a la tabla del histórico
            # "tabla_historico_<sufijo>". Si existe y la nueva aún no, se renombra conservando los datos.
            # Debe ejecutarse ANTES de create_all (que crearía una tabla nueva vacía).
            await conn.execute(text("""
                DO $$
                DECLARE heredada TEXT;
                BEGIN
                    IF to_regclass('public.tabla_historico') IS NULL THEN
                        SELECT table_name INTO heredada FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name LIKE 'tabla\\_historico\\_%'
                        ORDER BY table_name LIMIT 1;
                        IF heredada IS NOT NULL THEN
                            EXECUTE format('ALTER TABLE %I RENAME TO tabla_historico', heredada);
                        END IF;
                    END IF;
                END $$;
            """))

            # run_sync ejecuta la función sincrónica sobre la conexión adaptada
            await conn.run_sync(Base.metadata.create_all)
            
            # Migración manual para asegurar que las columnas tengan el tamaño correcto
            # SQLAlchemy Base.metadata.create_all no altera tablas existentes.
            await conn.execute(text("ALTER TABLE empresas ALTER COLUMN empresa TYPE VARCHAR(150)"))
            await conn.execute(text("ALTER TABLE empresas ALTER COLUMN codigo TYPE VARCHAR(20)"))

            # Migración para agregar usuario_id si falta (Errores 500)
            await conn.execute(text("ALTER TABLE tabla_todas_solicitudes ADD COLUMN IF NOT EXISTS usuario_id BIGINT"))
            await conn.execute(text("ALTER TABLE tabla_recepcionados ADD COLUMN IF NOT EXISTS usuario_id BIGINT"))
            await conn.execute(text("ALTER TABLE tabla_historico ADD COLUMN IF NOT EXISTS usuario_id BIGINT"))

            # Migraciones 2FA Empresarial
            await conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT"))
            await conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT"))
            await conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP WITHOUT TIME ZONE"))
            await conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITHOUT TIME ZONE"))

            # Migraciones para Dispositivos de Confianza
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS dispositivos_confianza (
                    id BIGSERIAL PRIMARY KEY,
                    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    device_token VARCHAR(255) UNIQUE NOT NULL,
                    device_name VARCHAR(255),
                    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                    last_used_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dispositivos_confianza_device_token ON dispositivos_confianza (device_token)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dispositivos_confianza_usuario_id ON dispositivos_confianza (usuario_id)"))

            # Tabla de control de inicialización de la base de datos
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS db_initialization_log (
                    key VARCHAR(50) PRIMARY KEY,
                    initialized_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """))

        logger.info("=" * 50)
        logger.info("Base de datos inicializada correctamente".center(50))
        logger.info("=" * 50)

    except Exception as e:
        logger.error("=" * 50)
        logger.error(f"❌ Error al inicializar la base de datos: {e}")
        logger.error("=" * 50)
        raise


# ======================================
# 🧱 Cierre limpio al apagar la app
# ======================================
async def close_db():
    try:
        await engine.dispose()

        logger.info("=" * 50)
        logger.info("Conexión a la base de datos cerrada".center(50))
        logger.info("=" * 50)

    except Exception as e:
        logger.error(f"❌ Error al cerrar la base de datos: {e}")
        raise
