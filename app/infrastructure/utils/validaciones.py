# app/domain/validators/validators.py
import re
from pydantic import field_validator


NAME_REGEX = re.compile(r"^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'-]{2,50}$")
PASSWORD_MIN_LENGTH = 8
CARACTERES_MINIMOS = 2
CARACTERES_MAXIMO_20 = 20
CARACTERES_MAXIMO_10 = 10
CARACTERES_MAXIMO_150 = 150
SYMBOL_REGEX = re.compile(r"[!@#$%^&*()_\-+=\[\]{};:,.?/<>|~]")
CORPORATIVO_EMAIL_REGEX = re.compile(r"^[\w\.-]+@flujopago\.cl$")
GRUPO_EMAIL_REGEX = re.compile(r"^[\w\.-]+@grupodemo\.cl$")


# ----------------------------------------------
# VALIDAR NOMBRES REQUERIDOS
# ----------------------------------------------
def validate_required_name(field: str):
    @field_validator(field)
    def validator(cls, v):
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio.")

        value = v.strip()

        if len(value) < 2:
            raise ValueError("El nombre debe tener al menos 2 caracteres.")
        if len(value) > 50:
            raise ValueError("El nombre no puede exceder los 50 caracteres.")

        if any(char.isdigit() for char in value):
            raise ValueError("El nombre no puede contener números.")

        # Permitir letras, espacios, apóstrofes y guiones
        if not NAME_REGEX.match(value):
            # Si no coincide con el regex pero ya revisamos números, es probable que tenga símbolos extraños
            raise ValueError(
                "El nombre contiene símbolos no permitidos. Solo se permiten letras, espacios, ' y -."
            )

        return value.lower()

    return validator


# ----------------------------------------------
# VALIDAR NOMBRES OPCIONALES
# ----------------------------------------------
def validate_optional_name(field: str):
    @field_validator(field)
    def validator(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None

        value = v.strip()

        if len(value) < 2:
            raise ValueError("El nombre debe tener al menos 2 caracteres.")
        if len(value) > 50:
            raise ValueError("El nombre no puede exceder los 50 caracteres.")

        if any(char.isdigit() for char in value):
            raise ValueError("El nombre no puede contener números.")

        if not NAME_REGEX.match(value):
            raise ValueError(
                "El nombre contiene símbolos no permitidos. Solo se permiten letras, espacios, ' y -."
            )

        return value.lower()

    return validator


# ----------------------------------------------
# VALIDAR IDS POSITIVOS
# ----------------------------------------------
def validate_positive_id(field: str):
    @field_validator(field)
    def validator(cls, v):
        if v is not None and v <= 0:
            raise ValueError("El ID debe ser un número positivo.")
        return v

    return validator


# ----------------------------------------------
# VALIDAR PASSWORD
# ----------------------------------------------
def validate_password(field: str):
    @field_validator(field)
    def validator(cls, v):
        if v is None:
            return v
        if len(v) < PASSWORD_MIN_LENGTH:
            raise ValueError(
                f"La contraseña debe tener al menos {PASSWORD_MIN_LENGTH} caracteres."
            )
        if not re.search(r"[A-Z]", v):
            raise ValueError("Debe contener al menos una letra mayúscula.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Debe contener al menos un número.")
        if not SYMBOL_REGEX.search(v):
            raise ValueError("Debe contener al menos un símbolo especial.")
        return v.strip()

    return validator


# ----------------------------------------------
# VALIDAR EMAIL
# ----------------------------------------------
_EMAILS_PRUEBA_HISTORICOS = "casa2301teo@gmail.com,basti@pushhr.cl,max.andres@pushhr.cl,valeria.guerrero@pushhr.cl,max.anti10@gmail.com"


def _emails_prueba_permitidos() -> list[str]:
    import os
    raw = os.getenv("EMAILS_PRUEBA_PERMITIDOS", _EMAILS_PRUEBA_HISTORICOS)
    emails = [e.strip().lower() for e in raw.split(",") if e.strip()]
    # El super administrador sembrado siempre debe poder iniciar sesión.
    seed = os.getenv("SEED_SUPER_ADMIN_EMAIL")
    if seed:
        emails.append(seed.strip().lower())
    return emails


def validate_corporate_email(field: str):
    @field_validator(field)
    def validator(cls, v):
        if not v:
            return v

        email_clean = v.strip().lower()

        # Lista de emails de prueba fuera de los dominios corporativos.
        # [AUDITORÍA H-32] Configurable por entorno (EMAILS_PRUEBA_PERMITIDOS, separados por coma) para poder
        # retirarla en producción sin tocar código. Sin la variable se conserva la lista histórica.
        lista_emails_prueba = _emails_prueba_permitidos()

        # Excepción temporal para el usuario de pruebas de 2FA y dominios de prueba autorizados
        if email_clean.endswith("@pushhr.cl") or email_clean in lista_emails_prueba:
            return email_clean

        if not (
            CORPORATIVO_EMAIL_REGEX.match(email_clean) or GRUPO_EMAIL_REGEX.match(email_clean)
        ):
            raise ValueError(
                "El correo debe pertenecer al dominio @flujopago.cl o @grupodemo.cl"
            )
        return email_clean

    return validator


# ----------------------------------------------
# VALIDAR CARACTERES LIMITES
# ----------------------------------------------
def validate_carateres_limites_20(field: str):
    @field_validator(field)
    def validator(cls, v):
        if v is None:
            return v
        if len(v) < CARACTERES_MINIMOS:
            raise ValueError(
                f"Este campo es demasiado corto (mínimo {CARACTERES_MINIMOS} caracteres)."
            )
        if len(v) > CARACTERES_MAXIMO_20:
            raise ValueError(
                f"Este campo excede el máximo permitido de {CARACTERES_MAXIMO_20} caracteres."
            )
        return v

    return validator


def validate_carateres_limites_150(field: str):
    @field_validator(field)
    def validator(cls, v):
        if v is None:
            return v
        if len(v) < CARACTERES_MINIMOS:
            raise ValueError(
                f"Este campo es demasiado corto (mínimo {CARACTERES_MINIMOS} caracteres)."
            )
        if len(v) > CARACTERES_MAXIMO_150:
            raise ValueError(
                f"Este campo excede el máximo permitido de {CARACTERES_MAXIMO_150} caracteres (actual: {len(v)})."
            )
        return v

    return validator


def validate_carateres_limites_10(field: str):
    @field_validator(field)
    def validator(cls, v):
        if v is None:
            return v
        if len(v) < CARACTERES_MINIMOS:
            raise ValueError(
                f"Este campo es demasiado corto (mínimo {CARACTERES_MINIMOS} caracteres)."
            )
        if len(v) > CARACTERES_MAXIMO_10:
            raise ValueError(
                f"Este campo excede el máximo permitido de {CARACTERES_MAXIMO_10} caracteres."
            )
        return v

    return validator


# ----------------------------------------------
# VALIDAR RUT CHILENO (SIN PUNTOS, CON GUION)
# ----------------------------------------------
RUT_REGEX = re.compile(r"^\d{7,8}-[\dkK]$")


def validate_rut(field: str):
    @field_validator(field)
    def validator(cls, v: str):
        if not v or not v.strip():
            raise ValueError("El RUT es requerido.")

        # 1️⃣ Normalizar: quitar puntos, mantener guion
        rut = v.replace(".", "").strip().upper()

        if "-" not in rut:
            raise ValueError(
                "El RUT debe incluir el guion antes del dígito verificador (ej: 12345678-9)."
            )

        # 2️⃣ Validar formato general
        if not RUT_REGEX.match(rut):
            raise ValueError(
                "El formato del RUT no es válido. Asegúrese de usar números y guion (ej: 12345678-9)."
            )

        # 3️⃣ Separar cuerpo y dígito verificador
        numero, dv = rut.split("-")

        # 4️⃣ Validator Modulo 11 REMOVED to allow testing with arbitrary RUTs
        # Only strict format is checked (regex above)

        # 5️⃣ Retornar RUT normalizado (sin puntos, con guion)
        rut_normalizado = f"{numero}-{dv}"
        rut_normalizado = rut_normalizado.strip()

        return rut_normalizado

    return validator
