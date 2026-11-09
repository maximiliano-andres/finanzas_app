import os
import aiosmtplib
from email.message import EmailMessage
from premailer import transform
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("EMAIL_SERVICE")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.mailtrap.io")
SMTP_PORT = int(os.getenv("SMTP_PORT", 2525))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "no-reply@flujopago.cl")
ALLOWED_EMAIL_DOMAINS = [
    d.strip().lower()
    for d in os.getenv(
        "ALLOWED_EMAIL_DOMAINS", "flujopago.cl,grupodemo.cl,gmail.com,pushhr.cl"
    ).split(",")
]


def is_domain_allowed(email: str) -> bool:
    try:
        domain = email.split("@")[1].lower()
        return domain in ALLOWED_EMAIL_DOMAINS
    except IndexError:
        return False


async def send_email_async(
    to_email: str, subject: str, html_content: str, embedded_images: dict = None
):
    """
    Envía un email asíncrono con soporte para imágenes embebidas.
    embedded_images: {"cid_name": ("filename.png", b"image_data_bytes", "image", "png")}
    """
    if not is_domain_allowed(to_email):
        logger.warning(f"Dominio no permitido para el correo: {to_email}")
        return False

    try:
        # Transform CSS classes to inline styles
        inline_html = transform(html_content)

        msg = EmailMessage()
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg["Subject"] = subject

        # Setting HTML payload
        msg.add_alternative(inline_html, subtype="html")

        # Add embedded images
        if embedded_images:
            for cid, (filename, data, maintype, subtype) in embedded_images.items():
                msg.get_payload()[0].add_related(
                    data,
                    maintype=maintype,
                    subtype=subtype,
                    cid=f"<{cid}>",
                    filename=filename,
                )

        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
            use_tls=SMTP_PORT == 465,
            start_tls=SMTP_PORT == 587 or SMTP_PORT == 2525,
        )
        logger.info(f"Correo enviado a {to_email} exitosamente.")
        return True
    except Exception as e:
        logger.error(f"Error enviando correo a {to_email}: {e}")
        return False


def generate_otp_email_template(otp_code: str) -> str:
    return f"""
    <html>
        <head>
            <style>
                body {{ font-family: 'Outfit', sans-serif; background-color: #f8fafc; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
                .header {{ text-align: center; margin-bottom: 30px; }}
                .header h1 {{ color: #5937b6; font-size: 24px; margin: 0; }}
                .content {{ color: #334155; line-height: 1.6; font-size: 16px; text-align: center; }}
                .otp-box {{ background-color: #f1f5f9; border: 2px dashed #46cacd; border-radius: 8px; padding: 20px; margin: 30px 0; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a; }}
                .footer {{ margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>FlujoPago Seguridad</h1>
                </div>
                <div class="content">
                    <p>Has solicitado un código de acceso de un solo uso (OTP) para iniciar sesión.</p>
                    <div class="otp-box">{otp_code}</div>
                    <p>Este código expirará en 5 minutos.</p>
                    <p>Si no solicitaste este código, puedes ignorar este mensaje.</p>
                </div>
                <div class="footer">
                    <p>© 2026 Maximiliano Andres</p>
                </div>
            </div>
        </body>
    </html>
    """


def generate_activation_email_template(backup_codes: list) -> str:
    codes_html = "".join(
        [
            f"<li style='margin-bottom: 5px; font-family: monospace;'>{c}</li>"
            for c in backup_codes
        ]
    )
    return f"""
    <html>
        <head>
            <style>
                body {{ font-family: 'Outfit', sans-serif; background-color: #f8fafc; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
                .header {{ text-align: center; margin-bottom: 30px; }}
                .header h1 {{ color: #5937b6; font-size: 24px; margin: 0; }}
                .content {{ color: #334155; line-height: 1.6; font-size: 16px; }}
                .qr-container {{ text-align: center; margin: 30px 0; padding: 20px; background-color: #f1f5f9; border-radius: 8px; }}
                .qr-container img {{ max-width: 200px; border-radius: 8px; }}
                .backup-codes {{ background-color: #fff8f1; border-left: 4px solid #f6bd45; padding: 15px 20px; margin: 30px 0; border-radius: 0 8px 8px 0; }}
                .backup-codes h3 {{ margin-top: 0; color: #d97706; }}
                .footer {{ margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Bienvenido a 2FA FlujoPago</h1>
                </div>
                <div class="content">
                    <p>Has iniciado la configuración de la Autenticación de Doble Factor (2FA). Este es un paso importante para mantener la seguridad de tu cuenta.</p>
                    
                    <div class="qr-container">
                        <p style="font-weight: bold; margin-bottom: 15px;">Escanea este código QR con Google Authenticator o Authy:</p>
                        <img src="cid:qr_image" alt="Código QR de Activación" />
                    </div>

                    <div class="backup-codes">
                        <h3>Tus códigos de recuperación</h3>
                        <p style="font-size: 14px;">Guarda estos códigos en un lugar seguro. Podrás usarlos si pierdes acceso a tu dispositivo móvil.</p>
                        <ul style="padding-left: 20px;">
                            {codes_html}
                        </ul>
                    </div>
                </div>
                <div class="footer">
                    <p>© 2026 Maximiliano Andres</p>
                </div>
            </div>
        </body>
    </html>
    """


def generate_temp_password_email_template(
    nombre: str, email: str, temp_password: str, motivo: str = "creación"
) -> str:
    """
    Template HTML para el correo de bienvenida con contraseña temporal.
    Se usa tanto al crear un usuario nuevo como al restablecer su contraseña.
    motivo: 'creación' | 'restablecimiento'
    """
    accion = "Tu cuenta ha sido creada" if motivo == "creación" else "Tu contraseña ha sido restablecida"
    return f"""
    <html>
        <head>
            <style>
                body {{ font-family: 'Outfit', sans-serif; background-color: #f8fafc; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
                .header {{ text-align: center; margin-bottom: 30px; }}
                .header h1 {{ color: #5937b6; font-size: 24px; margin: 0; }}
                .badge {{ display: inline-block; background-color: #ede9fe; color: #5937b6; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 10px; text-transform: uppercase; }}
                .content {{ color: #334155; line-height: 1.8; font-size: 16px; }}
                .cred-box {{ background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 28px; margin: 28px 0; }}
                .cred-box p {{ margin: 6px 0; font-size: 15px; }}
                .cred-box strong {{ color: #0f172a; }}
                .password {{ font-family: monospace; font-size: 20px; font-weight: bold; color: #5937b6; background-color: #ede9fe; padding: 8px 16px; border-radius: 6px; display: inline-block; margin-top: 6px; letter-spacing: 2px; }}
                .alert {{ background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 0 8px 8px 0; margin: 24px 0; font-size: 14px; color: #92400e; }}
                .footer {{ margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>FlujoPago — Gestión de Pagos</h1>
                    <span class="badge">Acceso Seguro</span>
                </div>
                <div class="content">
                    <p>Hola <strong>{nombre}</strong>,</p>
                    <p>{accion} exitosamente en la plataforma <strong>FlujoPago</strong>. A continuación encontrarás tus credenciales de acceso inicial.</p>

                    <div class="cred-box">
                        <p>📧 <strong>Correo:</strong> {email}</p>
                        <p>🔑 <strong>Contraseña temporal:</strong></p>
                        <span class="password">{temp_password}</span>
                    </div>

                    <div class="alert">
                        ⚠️ <strong>Importante:</strong> Al ingresar por primera vez, el sistema te solicitará crear una nueva contraseña personal. Esta contraseña temporal solo puede ser usada una vez.
                    </div>

                    <p>Por seguridad, esta contraseña no es almacenada por ningún administrador del sistema.</p>
                </div>
                <div class="footer">
                    <p>© 2026 Maximiliano Andres — No respondas este mensaje.</p>
                </div>
            </div>
        </body>
    </html>
    """

