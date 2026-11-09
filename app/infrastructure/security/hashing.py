from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("HASHING_UTILS")

# Config global unificado
ph = PasswordHasher(
    time_cost=3,
    memory_cost=64 * 1024,
    parallelism=2,
    hash_len=32
)

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(hashed: str, password: str) -> bool:
    try:
        return ph.verify(hashed, password)
    except VerifyMismatchError:
        return False
    except Exception as e:
        # Si el hash fue generado con otra config → esto explota aquí.
        logger.error(f"[ARGON2 ERROR] {e}")
        return False
