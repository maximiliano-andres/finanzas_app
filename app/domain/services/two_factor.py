import os
import pyotp
import qrcode
import base64
import json
from io import BytesIO
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from typing import Tuple
from app.infrastructure.security.hashing import hash_password, verify_password

load_dotenv()

# Clave de cifrado simétrico (generar con Fernet.generate_key() y poner en .env)
FERNET_KEY = os.getenv("FERNET_KEY", "b3k1k_nJpB6_0O1Xo08j8n-_Jg_2gP2h6-9uK0A1Z5Q=")
try:
    cipher_suite = Fernet(FERNET_KEY.encode() if isinstance(FERNET_KEY, str) else FERNET_KEY)
except ValueError:
    # Fallback si la clave no es válida en dev
    fallback_key = Fernet.generate_key()
    cipher_suite = Fernet(fallback_key)



MFA_ISSUER_NAME = os.getenv("MFA_ISSUER_NAME", "FlujoPago")
MFA_DOMAIN = os.getenv("MFA_DOMAIN", "flujopago.cl")

def encrypt_secret(secret: str) -> str:
    """
    Cifra un secreto TOTP en texto plano utilizando cifrado simétrico AES (Fernet).
    
    Esto evita que los secretos queden expuestos en texto plano en la base de datos, mitigando 
    riesgos en caso de volcado de datos.
    
    Args:
        secret (str): El secreto TOTP en texto plano generado (Base32).
        
    Returns:
        str: El secreto cifrado y codificado en base64 en formato string.
    """
    return cipher_suite.encrypt(secret.encode()).decode()

def decrypt_secret(encrypted_secret: str) -> str:
    """
    Descifra un secreto de base de datos cifrado simétricamente con Fernet.
    
    Args:
        encrypted_secret (str): El secreto cifrado (base64).
        
    Returns:
        str: El secreto original en texto plano (Base32).
    """
    return cipher_suite.decrypt(encrypted_secret.encode()).decode()

def generate_totp_secret() -> str:
    """
    Genera un nuevo secreto aleatorio compatible con el protocolo TOTP (RFC 6238).
    
    Returns:
        str: String aleatorio codificado en Base32 (longitud típica de 32 caracteres).
    """
    return pyotp.random_base32()

def verify_totp(secret: str, code: str) -> bool:
    """
    Verifica si un código de un solo uso (OTP) provisto por el usuario es válido.
    
    Valida el código contra el secreto TOTP descifrado tomando en cuenta la hora actual y 
    la ventana de tiempo estándar (30 segundos).
    
    Args:
        secret (str): El secreto TOTP en texto plano (Base32).
        code (str): El código de 6 dígitos ingresado por el usuario.
        
    Returns:
        bool: True si el código es válido para la ventana actual, False en caso contrario.
    """
    totp = pyotp.TOTP(secret)
    return totp.verify(code)

def generate_backup_codes(n: int = None) -> Tuple[list[str], str]:
    """
    Genera códigos de respaldo (Backup Codes) de un solo uso para recuperación de cuentas.
    
    Flujo de ejecución:
    1. Genera N códigos aleatorios legibles en formato `XXXX-XXXX`.
    2. Aplica hash de contraseñas (Argon2) individualmente a cada uno de ellos para almacenamiento seguro.
    3. Serializa el listado de hashes en una cadena JSON.
    
    Riesgos y consideraciones:
    - La lista plana devuelta debe mostrarse AL USUARIO ÚNICAMENTE UNA VEZ.
    - En la base de datos se guarda exclusivamente la cadena JSON con los códigos hasheados.
    
    Args:
        n (int, opcional): Cantidad de códigos a generar. Por defecto lee de la variable de 
                           entorno 'MFA_BACKUP_CODES_COUNT' (o usa 10).
                           
    Returns:
        Tuple[list[str], str]: 
            - list[str]: Los códigos planos legibles por el usuario.
            - str: Representación JSON de la lista de códigos hasheados.
    """
    if n is None:
        n = int(os.getenv("MFA_BACKUP_CODES_COUNT", 10))
    import secrets
    import string
    
    codes = []
    hashed_codes = []
    
    for _ in range(n):
        # Generar código formato XXXX-XXXX
        part1 = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        part2 = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        code = f"{part1}-{part2}"
        codes.append(code)
        hashed_codes.append(hash_password(code))
        
    return codes, json.dumps(hashed_codes)

def verify_and_consume_backup_code(backup_code: str, hashed_codes_json: str) -> Tuple[bool, str]:
    """
    Verifica un código de respaldo y, en caso de ser válido, lo consume (remueve de la lista).
    
    Flujo de ejecución:
    1. Deserializa el JSON de códigos hasheados de la base de datos.
    2. Compara secuencialmente el código plano provisto contra cada hash usando Argon2.
    3. Si coincide, remueve ese elemento de la lista (para prevenir su reutilización) y actualiza el JSON.
    
    Restricciones:
    - Esta operación es destructiva para el código verificado.
    - Se debe guardar el nuevo JSON devuelto en la base de datos para registrar el consumo.
    
    Args:
        backup_code (str): El código ingresado por el usuario (ej: 'ABCD-1234').
        hashed_codes_json (str): Cadena JSON actual de hashes almacenada en la BD.
        
    Returns:
        Tuple[bool, str]: 
            - bool: True si el código coincide y fue consumido con éxito, False de lo contrario.
            - str: Cadena JSON actualizada (sin el código consumido) o la cadena original si falló.
    """
    if not hashed_codes_json:
        return False, hashed_codes_json
        
    try:
        hashed_codes = json.loads(hashed_codes_json)
        for i, hashed in enumerate(hashed_codes):
            if verify_password(hashed, backup_code):
                # Remover código usado
                hashed_codes.pop(i)
                return True, json.dumps(hashed_codes)
    except Exception:
        return False, hashed_codes_json
        
    return False, hashed_codes_json

def get_provisioning_uri(email: str, secret: str) -> str:
    """
    Genera la URI estándar 'otpauth://' necesaria para configurar Google Authenticator o apps similares.
    
    Args:
        email (str): El correo del usuario (se usará como nombre de la cuenta).
        secret (str): El secreto TOTP en texto plano (Base32).
        
    Returns:
        str: URI formateada lista para codificación en código QR.
    """
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name=MFA_ISSUER_NAME
    )

def generate_qr_base64(uri: str) -> str:
    """
    Genera una imagen en código QR a partir de la URI de aprovisionamiento de TOTP 
    y la devuelve en formato de cadena Base64 con el prefijo MIME.
    
    Args:
        uri (str): URI estándar 'otpauth://'.
        
    Returns:
        str: String en formato 'data:image/png;base64,...' útil para embeber directamente en HTML.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(uri)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    
    return f"data:image/png;base64,{img_str}"
