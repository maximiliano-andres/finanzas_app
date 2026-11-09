import os
import redis.asyncio as redis
from app.infrastructure.utils.logger_personalizado import setup_logger
from dotenv import load_dotenv

logger = setup_logger("REDIS_SERVICE")
load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://:flujopago_redis_secret@127.0.0.1:6379/0")

# Cliente global
redis_client = None

async def init_redis():
    global redis_client
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info("=" * 50)
        logger.info("Conexión a Redis exitosa".center(50))
        logger.info("=" * 50)
    except Exception as e:
        logger.error(f"Error conectando a Redis: {e}")
        # No levantamos excepción para que la app inicie incluso si Redis falla,
        # pero el 2FA dependerá de que esté vivo.

async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()
        logger.info("Conexión a Redis cerrada")

# --- Funciones MFA ---

async def store_mfa_pending(user_id: int, token: str, expire_seconds: int = None):
    if not redis_client: return
    if expire_seconds is None:
        expire_seconds = int(os.getenv("MFA_PENDING_EXPIRE_SECONDS", 300))
    await redis_client.setex(f"mfa_pending:{token}", expire_seconds, str(user_id))

async def get_mfa_pending(token: str) -> str | None:
    if not redis_client: return None
    return await redis_client.get(f"mfa_pending:{token}")

async def delete_mfa_pending(token: str):
    if not redis_client: return
    await redis_client.delete(f"mfa_pending:{token}")

async def increment_mfa_attempts(user_id: int, ip: str, expire_seconds: int = None) -> int:
    if not redis_client: return 1
    if expire_seconds is None:
        expire_seconds = int(os.getenv("MFA_LOCK_DURATION_SECONDS", 900))
    key = f"mfa_attempts:{user_id}:{ip}"
    attempts = await redis_client.incr(key)
    if attempts == 1:
        await redis_client.expire(key, expire_seconds)
    return attempts

async def is_mfa_locked(user_id: int, ip: str, max_attempts: int = None) -> bool:
    if not redis_client: return False
    if max_attempts is None:
        max_attempts = int(os.getenv("MFA_MAX_ATTEMPTS", 5))
    key = f"mfa_attempts:{user_id}:{ip}"
    attempts_str = await redis_client.get(key)
    if attempts_str and int(attempts_str) >= max_attempts:
        return True
    return False

async def clear_mfa_attempts(user_id: int, ip: str):
    if not redis_client: return
    key = f"mfa_attempts:{user_id}:{ip}"
    await redis_client.delete(key)

# --- Funciones Email OTP ---

async def store_email_otp(user_id: int, otp: str, expire_seconds: int = None):
    if not redis_client: return
    if expire_seconds is None:
        expire_seconds = int(os.getenv("EMAIL_OTP_EXPIRE_SECONDS", 300))
    await redis_client.setex(f"email_otp:{user_id}", expire_seconds, otp)

async def get_email_otp(user_id: int) -> str | None:
    if not redis_client: return None
    return await redis_client.get(f"email_otp:{user_id}")

async def delete_email_otp(user_id: int):
    if not redis_client: return
    await redis_client.delete(f"email_otp:{user_id}")

async def check_email_otp_rate_limit(user_id: int, expire_seconds: int = None) -> bool:
    """Verifica si ya se envió un OTP recientemente (ej. en el último minuto). Retorna True si está en rate limit."""
    if not redis_client: return False
    if expire_seconds is None:
        expire_seconds = int(os.getenv("EMAIL_OTP_RATE_LIMIT_SECONDS", 60))
    key = f"rate_limit_email_otp:{user_id}"
    exists = await redis_client.exists(key)
    if exists:
        return True
    await redis_client.setex(key, expire_seconds, "1")
    return False


# --- Funciones de Intentos de Login (Email + Contraseña) ---

async def increment_login_attempts(email: str, ip: str, expire_seconds: int = None) -> int:
    if not redis_client: return 1
    if expire_seconds is None:
        expire_seconds = int(os.getenv("LOGIN_LOCK_DURATION_SECONDS", 900))
    key = f"login_attempts:{email}:{ip}"
    attempts = await redis_client.incr(key)
    if attempts == 1:
        await redis_client.expire(key, expire_seconds)
    return attempts

async def is_login_locked(email: str, ip: str, max_attempts: int = None) -> bool:
    if not redis_client: return False
    if max_attempts is None:
        max_attempts = int(os.getenv("LOGIN_MAX_ATTEMPTS", 5))
    key = f"login_attempts:{email}:{ip}"
    attempts_str = await redis_client.get(key)
    if attempts_str and int(attempts_str) >= max_attempts:
        return True
    return False

async def clear_login_attempts(email: str, ip: str):
    if not redis_client: return
    key = f"login_attempts:{email}:{ip}"
    await redis_client.delete(key)

