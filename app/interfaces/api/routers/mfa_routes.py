from fastapi import APIRouter, Depends, Request, Response, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import asyncio
import secrets

from app.infrastructure.db.database import get_db
from app.infrastructure.security.auth_token_roles import get_current_user
from app.infrastructure.security.jwt_handler import create_token, ACCESS_TOKEN_EXPIRE, verify_token
from app.domain.models.tabla_usuarios import Usuarios
from app.infrastructure.utils.response_wrapper import success_response, error_response as _error_body
from fastapi.responses import JSONResponse


def error_response(message: str, request=None, status_code: int = 400) -> JSONResponse:
    """AUDITORÍA H-29: mismo cuerpo de error, pero con el código HTTP real (antes siempre HTTP 200)."""
    return JSONResponse(status_code=status_code, content=_error_body(message, request=request, status_code=status_code))
from app.infrastructure.utils.logger_personalizado import setup_logger

from app.domain.dto.mfaDTO import (
    MFASetupResponse,
    MFAVerifyRequest,
    MFAVerifyResponse,
    MFABackupVerifyRequest,
    MFAStatusResponse
)

from app.domain.services.two_factor import (
    generate_totp_secret,
    encrypt_secret,
    decrypt_secret,
    verify_totp,
    generate_backup_codes,
    verify_and_consume_backup_code,
    get_provisioning_uri,
    generate_qr_base64
)

from app.infrastructure.security.redis_service import (
    increment_mfa_attempts,
    is_mfa_locked,
    clear_mfa_attempts,
    store_email_otp,
    get_email_otp,
    delete_email_otp,
    check_email_otp_rate_limit
)

from app.infrastructure.mailing.email_service import (
    send_email_async,
    generate_activation_email_template,
    generate_otp_email_template
)

logger = setup_logger("MFA_ROUTES")
router = APIRouter(prefix="/flujopago/gestion-pagos/v1")

def get_friendly_device_name(user_agent: str) -> str:
    if not user_agent:
        return "Dispositivo desconocido"
    
    ua = user_agent.lower()
    
    # Detect browser
    browser = "Navegador Desconocido"
    if "chrome" in ua or "chromium" in ua:
        browser = "Chrome"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "edge" in ua:
        browser = "Edge"
    elif "opera" in ua or "opr" in ua:
        browser = "Opera"
        
    # Detect OS
    os_name = "Sistema Desconocido"
    if "windows" in ua:
        os_name = "Windows"
    elif "macintosh" in ua or "mac os" in ua:
        os_name = "macOS"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "android" in ua:
        os_name = "Android"
    elif "linux" in ua:
        os_name = "Linux"
        
    return f"{browser} en {os_name}"

async def register_trusted_device_if_requested(
    request: Request,
    response: Response,
    user_id: int,
    current_user_dict: dict,
    session: AsyncSession
) -> None:
    if not current_user_dict.get("remember_device", False):
        return

    import uuid
    from datetime import datetime, timedelta
    import jwt
    from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
    from app.infrastructure.security.jwt_handler import SECRET_KEY, ALGORITHM

    device_uuid = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=30)
    user_agent = request.headers.get("user-agent", "")
    device_name = get_friendly_device_name(user_agent)

    # Save to database
    db_device = DispositivosConfianza(
        usuario_id=user_id,
        device_token=device_uuid,
        device_name=device_name,
        expires_at=expires_at
    )
    session.add(db_device)
    await session.commit()

    # Generate JWT signed cookie
    cookie_payload = {
        "sub": str(user_id),
        "jti": device_uuid,
        "exp": int(expires_at.timestamp())
    }
    trusted_device_jwt = jwt.encode(cookie_payload, SECRET_KEY, algorithm=ALGORITHM)

    # Set cookie
    response.set_cookie(
        key="trusted_device",
        value=trusted_device_jwt,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        max_age=30 * 24 * 60 * 60
    )
    logger.info(f"Dispositivo registrado y confiado por 30 días para el usuario {user_id}: {device_name}")

# Keep strong references to background tasks to prevent garbage collection
background_tasks = set()

@router.get("/mfa/status", tags=["2FA"], response_model=MFAStatusResponse)
async def mfa_status(
    request: Request,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Consulta el estado del 2FA del usuario actual."""
    user_id = int(current_user_dict["sub"])
    usuario = await session.get(Usuarios, user_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    import os
    super_admin_email = os.getenv("SEED_SUPER_ADMIN_EMAIL", "super_admin@flujopago.cl")
    is_super_admin = (usuario.email == super_admin_email)

    return MFAStatusResponse(
        mfa_enabled=usuario.mfa_enabled,
        mfa_verified_at=usuario.mfa_verified_at.isoformat() if usuario.mfa_verified_at else None,
        must_change_password=False if is_super_admin else usuario.must_change_password
    )

@router.post("/mfa/setup", tags=["2FA"])
async def mfa_setup(
    request: Request,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Genera el secreto y los códigos de respaldo. (Debe confirmarse luego)."""
    user_id = int(current_user_dict["sub"])
    usuario = await session.get(Usuarios, user_id)
    
    logger.info(f"Inicio de configuración MFA para usuario ID={user_id}")
    
    if usuario.mfa_enabled:
        return error_response("El 2FA ya está activado.", request=request, status_code=400)

    # Generar secret y backup codes
    raw_secret = generate_totp_secret()
    encrypted_secret = encrypt_secret(raw_secret)
    raw_backup_codes, hashed_backup_codes_json = generate_backup_codes(10)
    
    # Guardar en base de datos temporalmente hasta que se verifique (mfa_enabled = False)
    usuario.mfa_secret_encrypted = encrypted_secret
    usuario.mfa_backup_codes = hashed_backup_codes_json
    await session.commit()
    
    # Generar QR
    uri = get_provisioning_uri(usuario.email, raw_secret)
    qr_b64 = generate_qr_base64(uri)
    
    # Enviar correo de activación en background
    html_content = generate_activation_email_template(raw_backup_codes)
    # Extraer la imagen b64: data:image/png;base64,.....
    try:
        _, encoded = qr_b64.split(",", 1)
        import base64
        image_data = base64.b64decode(encoded)
        embedded_images = {"qr_image": ("qr_code.png", image_data, "image", "png")}
        task = asyncio.create_task(send_email_async(usuario.email, "Bienvenido a 2FA FlujoPago - Activación", html_content, embedded_images))
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)
    except Exception as e:
        logger.error(f"Error parseando QR para correo: {e}")
    
    return success_response(
        data={
            "qr_code_base64": qr_b64,
            "backup_codes": raw_backup_codes,
            "provisioning_uri": uri
        },
        message="Secreto generado. Por favor confirme con un código válido. Se ha enviado un correo con el QR y los códigos de respaldo.",
        request=request
    )

@router.post("/mfa/verify-setup", tags=["2FA"])
async def mfa_verify_setup(
    request: Request,
    response: Response,
    data: MFAVerifyRequest,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Verifica el primer código para habilitar definitivamente el 2FA y autenticar la sesión."""
    user_id = int(current_user_dict["sub"])
    client_ip = request.client.host if request.client else "unknown"

    # Rate Limiting de Setup
    if await is_mfa_locked(user_id, client_ip):
        logger.warning(f"Intento de verificación de configuración MFA bloqueado por rate limit para usuario ID={user_id}")
        return error_response(
            "Demasiados intentos fallidos. Intente nuevamente en 15 minutos.", 
            request=request, status_code=429
        )

    usuario = await session.get(Usuarios, user_id)
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    if not usuario.mfa_secret_encrypted:
        return error_response("Debe llamar a /setup primero.", request=request, status_code=400)
        
    # Verificar primero si hay un OTP en correo
    email_otp = await get_email_otp(user_id)
    is_valid = False
    
    if email_otp and email_otp == data.code:
        is_valid = True
        await delete_email_otp(user_id) # Consumir
    else:
        # Fallback a TOTP de aplicación
        raw_secret = decrypt_secret(usuario.mfa_secret_encrypted)
        if verify_totp(raw_secret, data.code):
            is_valid = True
            
    if not is_valid:
        await increment_mfa_attempts(user_id, client_ip)
        logger.warning(f"Intento fallido de verificación de configuración MFA para usuario ID={user_id}")
        return error_response("Código inválido.", request=request, status_code=400)
        
    # Limpiar intentos fallidos si es exitoso
    await clear_mfa_attempts(user_id, client_ip)

    if not usuario.mfa_enabled:
        usuario.mfa_enabled = True
        
    usuario.mfa_verified_at = datetime.utcnow()
    await session.commit()
    
    # Registrar dispositivo de confianza si se solicitó
    await register_trusted_device_if_requested(request, response, user_id, current_user_dict, session)
    logger.info(f"MFA activado y verificado exitosamente por usuario ID={user_id}")

    # Generar nuevo token con el claim mfa_verified = True para evitar doble login
    payload = current_user_dict.copy()
    payload.pop("exp", None) # Remover exp anterior para generar uno nuevo
    payload["mfa_verified"] = True
    
    new_token = create_token(payload, ACCESS_TOKEN_EXPIRE)
    
    # Actualizar la cookie
    response.set_cookie(
        key="access_token",
        value=new_token,
        httponly=True,
        secure=request.url.scheme == "https", # True en prod HTTPS
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE
    )
    
    return success_response(
        data={"access_token": new_token, "token_type": "bearer", "mfa_enabled": True},
        message="2FA activado y verificado correctamente.",
        request=request
    )


@router.post("/mfa/send-email-otp", tags=["2FA"])
async def send_email_otp(
    request: Request,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Genera y envía un código OTP de 6 dígitos al correo del usuario."""
    user_id = int(current_user_dict["sub"])
    usuario = await session.get(Usuarios, user_id)
    
    if not usuario or not usuario.email:
        return error_response("Usuario o correo no encontrado.", request=request, status_code=400)
        
    if await check_email_otp_rate_limit(user_id):
        logger.warning(f"Solicitud de OTP por correo bloqueada por rate limit para usuario ID={user_id}")
        return error_response("Ya se ha enviado un código recientemente. Espere un minuto.", request=request, status_code=429)
        
    # Generate 6-digit OTP
    otp = "".join(secrets.choice("0123456789") for _ in range(6))
    
    # Store in Redis
    await store_email_otp(user_id, otp)
    
    # Send email
    html_content = generate_otp_email_template(otp)
    task = asyncio.create_task(send_email_async(usuario.email, "Tu código de acceso FlujoPago (OTP)", html_content))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
    logger.info(f"OTP enviado por correo a usuario ID={user_id}")
    
    # Extra hint on response for UI mapping
    email_hint = f"{usuario.email[:3]}***@{usuario.email.split('@')[1]}" if "@" in usuario.email else "tu correo"
    
    return success_response(
        data=None,
        message=f"Código enviado exitosamente a {email_hint}",
        request=request
    )


@router.post("/mfa/verify", tags=["2FA"])
async def mfa_verify(
    request: Request,
    response: Response,
    data: MFAVerifyRequest,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Verifica el código 2FA después del login para obtener un token verificado."""
    user_id = int(current_user_dict["sub"])
    client_ip = request.client.host if request.client else "unknown"
    
    # Rate Limiting
    if await is_mfa_locked(user_id, client_ip):
        logger.warning(f"Intento de verificación MFA bloqueado por rate limit para usuario ID={user_id}")
        return error_response(
            "Demasiados intentos fallidos. Intente nuevamente en 15 minutos.", 
            request=request, status_code=429
        )
        
    usuario = await session.get(Usuarios, user_id)
    if not usuario or not usuario.mfa_enabled:
        return error_response("2FA no está habilitado.", request=request, status_code=400)
        
    # Verificar primero si hay un OTP en correo
    email_otp = await get_email_otp(user_id)
    is_valid = False
    
    if email_otp and email_otp == data.code:
        is_valid = True
        await delete_email_otp(user_id) # Consumir
    else:
        # Fallback a TOTP de aplicación
        raw_secret = decrypt_secret(usuario.mfa_secret_encrypted)
        if verify_totp(raw_secret, data.code):
            is_valid = True
            
    if not is_valid:
        await increment_mfa_attempts(user_id, client_ip)
        logger.warning(f"Intento fallido de verificación MFA para usuario ID={user_id}")
        return error_response("Código inválido.", request=request, status_code=401)
        
    # Exito: Limpiar intentos
    await clear_mfa_attempts(user_id, client_ip)
    
    usuario.mfa_verified_at = datetime.utcnow()
    await session.commit()
    logger.info(f"Autenticación 2FA exitosa para usuario ID={user_id}")
    
    # Registrar dispositivo de confianza si se solicitó
    await register_trusted_device_if_requested(request, response, user_id, current_user_dict, session)

    # Generar nuevo token con el claim mfa_verified = True
    payload = current_user_dict.copy()
    payload.pop("exp", None) # Remover exp anterior para generar uno nuevo
    payload["mfa_verified"] = True
    
    new_token = create_token(payload, ACCESS_TOKEN_EXPIRE)
    
    # Actualizar la cookie
    response.set_cookie(
        key="access_token",
        value=new_token,
        httponly=True,
        secure=request.url.scheme == "https", # True en prod HTTPS
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE
    )
    
    return success_response(
        data={"access_token": new_token, "token_type": "bearer"},
        message="Autenticación 2FA exitosa.",
        request=request
    )

@router.post("/mfa/verify-backup", tags=["2FA"])
async def mfa_verify_backup(
    request: Request,
    response: Response,
    data: MFABackupVerifyRequest,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Usa un código de respaldo en caso de perder el dispositivo TOTP."""
    user_id = int(current_user_dict["sub"])
    client_ip = request.client.host if request.client else "unknown"
    
    if await is_mfa_locked(user_id, client_ip):
        logger.warning(f"Intento de verificación de código de respaldo bloqueado por rate limit para usuario ID={user_id}")
        return error_response(
            "Demasiados intentos fallidos. Intente nuevamente en 15 minutos.", 
            request=request, status_code=429
        )
        
    usuario = await session.get(Usuarios, user_id)
    if not usuario or not usuario.mfa_enabled:
        return error_response("2FA no está habilitado.", request=request, status_code=400)
        
    is_valid, new_hashed_codes_json = verify_and_consume_backup_code(
        data.backup_code, 
        usuario.mfa_backup_codes
    )
    
    if not is_valid:
        await increment_mfa_attempts(user_id, client_ip)
        logger.warning(f"Intento fallido de verificación de código de respaldo para usuario ID={user_id}")
        return error_response("Código de respaldo inválido o ya utilizado.", request=request, status_code=401)
        
    # Exito: Guardar nuevos backup codes y limpiar rate limit
    usuario.mfa_backup_codes = new_hashed_codes_json
    usuario.mfa_verified_at = datetime.utcnow()
    await session.commit()
    await clear_mfa_attempts(user_id, client_ip)
    logger.info(f"Ingreso de emergencia por código de respaldo exitoso para usuario ID={user_id}")
    
    # Registrar dispositivo de confianza si se solicitó
    await register_trusted_device_if_requested(request, response, user_id, current_user_dict, session)

    # Generar nuevo token con mfa_verified
    payload = current_user_dict.copy()
    payload.pop("exp", None)
    payload["mfa_verified"] = True
    new_token = create_token(payload, ACCESS_TOKEN_EXPIRE)
    
    response.set_cookie(
        key="access_token",
        value=new_token,
        httponly=True,
        secure=request.url.scheme == "https", 
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE
    )
    
    return success_response(
        data={"access_token": new_token, "token_type": "bearer"},
        message="Ingreso de emergencia exitoso.",
        request=request
    )

@router.post("/mfa/disable", tags=["2FA"])
async def mfa_disable(
    request: Request,
    response: Response,
    data: MFAVerifyRequest,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Desactiva el 2FA. Requiere un código TOTP actual para confirmar."""
    # Como extra de seguridad, exigimos que ya esté mfa_verified el token
    if not current_user_dict.get("mfa_verified"):
        return error_response("Debe estar autenticado con 2FA para desactivarlo.", request=request, status_code=403)

    user_id = int(current_user_dict["sub"])
    usuario = await session.get(Usuarios, user_id)
    
    if not usuario or not usuario.mfa_enabled:
        return error_response("2FA no está habilitado.", request=request, status_code=400)
        
    email_otp = await get_email_otp(user_id)
    is_valid = False
    
    if email_otp and email_otp == data.code:
        is_valid = True
        await delete_email_otp(user_id)
    else:
        raw_secret = decrypt_secret(usuario.mfa_secret_encrypted)
        if verify_totp(raw_secret, data.code):
            is_valid = True
            
    if not is_valid:
        logger.warning(f"Intento fallido de desactivación de 2FA para usuario ID={user_id}: Código incorrecto")
        return error_response("Código inválido.", request=request, status_code=401)
        
    usuario.mfa_enabled = False
    usuario.mfa_secret_encrypted = None
    usuario.mfa_backup_codes = None
    
    # Revocar todos los dispositivos de confianza
    from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
    from sqlalchemy import delete
    await session.execute(
        delete(DispositivosConfianza).where(DispositivosConfianza.usuario_id == user_id)
    )
    await session.commit()
    
    # Eliminar cookie de dispositivo
    response.delete_cookie(
        key="trusted_device",
        httponly=True,
        secure=False,
        samesite="lax",
    )
    logger.info(f"2FA desactivado exitosamente para usuario ID={user_id}")
    
    return success_response(
        data=None,
        message="2FA ha sido desactivado.",
        request=request
    )

@router.get("/mfa/devices", tags=["2FA"])
async def get_trusted_devices(
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Listado de dispositivos de confianza del usuario."""
    user_id = int(current_user_dict["sub"])
    from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
    result = await session.execute(
        select(DispositivosConfianza).where(DispositivosConfianza.usuario_id == user_id).order_by(DispositivosConfianza.last_used_at.desc())
    )
    devices = result.scalars().all()
    
    return [
        {
            "id": d.id,
            "device_name": d.device_name,
            "created_at": d.created_at.isoformat(),
            "expires_at": d.expires_at.isoformat(),
            "last_used_at": d.last_used_at.isoformat()
        }
        for d in devices
    ]

@router.delete("/mfa/devices/{device_id}", tags=["2FA"])
async def revoke_trusted_device(
    device_id: int,
    request: Request,
    response: Response,
    current_user_dict: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
):
    """Revoca un dispositivo de confianza específico."""
    user_id = int(current_user_dict["sub"])
    from app.domain.models.tabla_dispositivos_confianza import DispositivosConfianza
    
    result = await session.execute(
        select(DispositivosConfianza).where(
            DispositivosConfianza.id == device_id,
            DispositivosConfianza.usuario_id == user_id
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
        
    # Si es el dispositivo actual, eliminar la cookie
    trusted_device_jwt = request.cookies.get("trusted_device")
    if trusted_device_jwt:
        try:
            import jwt
            from app.infrastructure.security.jwt_handler import SECRET_KEY, ALGORITHM
            cookie_payload = jwt.decode(trusted_device_jwt, SECRET_KEY, algorithms=[ALGORITHM])
            if cookie_payload.get("jti") == device.device_token:
                response.delete_cookie(
                    key="trusted_device",
                    httponly=True,
                    secure=False,
                    samesite="lax",
                )
        except Exception:
            pass

    await session.delete(device)
    await session.commit()
    logger.info(f"Dispositivo de confianza ID={device_id} revocado por usuario ID={user_id}")
    
    return {"status": "success", "message": "Dispositivo de confianza revocado correctamente"}
