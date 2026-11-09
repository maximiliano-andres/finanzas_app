# Funcionalidades Especiales — FlujoPago

Este documento profundiza en los mecanismos de seguridad y funcionalidades no triviales implementados en FlujoPago: autenticación multifactor, dispositivos de confianza, protección de sesión, Redis, correo electrónico, protección de documentos y el pipeline de seguridad de dependencias.

---

## Tabla de Contenido

- [Autenticación de Dos Factores (2FA)](#autenticación-de-dos-factores-2fa)
- [Verificación 2FA por Correo (Email OTP)](#verificación-2fa-por-correo-email-otp)
- [Dispositivos de Confianza](#dispositivos-de-confianza)
- [Bloqueo por Intentos Fallidos (Rate Limiting con Redis)](#bloqueo-por-intentos-fallidos-rate-limiting-con-redis)
- [Gestión de Contraseñas y Restablecimiento Administrativo](#gestión-de-contraseñas-y-restablecimiento-administrativo)
- [Sesión y Tokens JWT](#sesión-y-tokens-jwt)
- [Hashing de Contraseñas (Argon2id)](#hashing-de-contraseñas-argon2id)
- [Cabeceras de Seguridad HTTP](#cabeceras-de-seguridad-http)
- [Enmascarado de Errores](#enmascarado-de-errores)
- [Protección de Documentos PDF](#protección-de-documentos-pdf)
- [Redis: Usos en el Sistema](#redis-usos-en-el-sistema)
- [Correo Electrónico (SMTP)](#correo-electrónico-smtp)
- [Respaldos y Continuidad](#respaldos-y-continuidad)
- [Seguridad de Dependencias (CI/CD)](#seguridad-de-dependencias-cicd)
- [Notas de Seguridad y Recomendaciones](#notas-de-seguridad-y-recomendaciones)

---

## Autenticación de Dos Factores (2FA)

FlujoPago implementa **TOTP** (Time-based One-Time Password, RFC 6238), compatible con Google Authenticator, Authy y cualquier aplicación equivalente, con una alternativa de **código enviado por correo electrónico**.

### Componentes

| Componente | Archivo |
| --- | --- |
| Generación/verificación TOTP, cifrado, backup codes | `app/domain/services/two_factor.py` |
| DTOs de entrada/salida | `app/domain/dto/mfaDTO.py` |
| Endpoints REST | `app/interfaces/api/routers/mfa_routes.py` |
| Middleware de aplicación de la política MFA | `app/infrastructure/security/mfa_dependency.py` |
| Rate limiting y OTP temporal | `app/infrastructure/security/redis_service.py` |

### Flujo de activación

1. `POST /mfa/setup` — genera un secreto TOTP aleatorio (`pyotp.random_base32()`), lo cifra con **Fernet** (AES simétrico) y lo guarda en `usuarios.mfa_secret_encrypted`. Genera 10 códigos de respaldo (formato `XXXX-XXXX`), los hashea individualmente con **Argon2id** y los guarda como JSON en `usuarios.mfa_backup_codes`. Genera un código QR (PNG en base64) con la URI `otpauth://` estándar. Envía un correo de activación con el QR embebido y los backup codes en texto plano. En este punto, `mfa_enabled` sigue en `false`.
2. `POST /mfa/verify-setup` — el usuario ingresa el primer código (de la app o recibido por correo). Si es válido, se activa `mfa_enabled=true`, se registra `mfa_verified_at` y se emite un nuevo JWT con `mfa_verified=true`.

### Flujo de verificación en cada sesión

Con el 2FA ya activo, cada nuevo login (salvo bypass por dispositivo de confianza) redirige a `/mfa-verify`, donde el usuario puede:

- Ingresar el código TOTP de su aplicación (`POST /mfa/verify`).
- Solicitar un código por correo (`POST /mfa/send-email-otp`) e ingresarlo en el mismo endpoint `/mfa/verify` — el sistema comprueba primero si existe un OTP de correo vigente en Redis antes de validar contra el TOTP, de modo que **ambos canales son intercambiables**.
- Usar un código de respaldo si perdió el dispositivo (`POST /mfa/verify-backup`), que se consume (invalida) tras un uso exitoso.

### Desactivación

`POST /mfa/disable` exige que la sesión actual ya tenga `mfa_verified=true` (es decir, que el usuario haya validado su 2FA en este mismo login) además del código de verificación. Al desactivar, se limpian `mfa_secret_encrypted`, `mfa_backup_codes`, `mfa_verified_at`, y se revocan **todos** los dispositivos de confianza asociados al usuario.

### Consideración operativa sobre `FERNET_KEY`

El secreto TOTP se descifra con la misma `FERNET_KEY` con la que se cifró. Si esta clave se regenera o se pierde, **todos los secretos TOTP existentes quedan permanentemente inutilizables** y los usuarios afectados deberán reconfigurar su 2FA desde cero (`/mfa/setup`). Por este motivo, `FERNET_KEY` debe generarse una única vez y respaldarse junto con las credenciales críticas del sistema.

---

## Verificación 2FA por Correo (Email OTP)

Alternativa al código TOTP de la aplicación, pensada para usuarios sin acceso inmediato a su app de autenticación.

- `POST /mfa/send-email-otp` genera un código numérico de 6 dígitos (`secrets.choice`, criptográficamente seguro) y lo almacena en Redis bajo la clave `email_otp:{user_id}` con un **TTL de 5 minutos**.
- El código se envía por correo con una plantilla dedicada (`generate_otp_email_template`).
- **Límite de envío**: 1 correo por usuario cada 60 segundos (`rate_limit_email_otp:{user_id}`) — evita abuso del canal de correo.
- El código puede usarse en `verify-setup`, `verify` y `disable` exactamente igual que un código TOTP; se consume (se borra de Redis) tras una verificación exitosa.

---

## Dispositivos de Confianza

Mecanismo para reducir la fricción del 2FA en equipos de uso habitual, sin comprometer la seguridad de equipos desconocidos.

### Registro

Al marcar `remember_device: true` durante el login y completar exitosamente el 2FA, el sistema:

1. Genera un identificador único (`uuid4`).
2. Calcula la vigencia: **30 días** desde el registro.
3. Detecta un nombre amigable a partir del header `User-Agent` (navegador + sistema operativo, p. ej. "Chrome en Windows").
4. Inserta un registro en `dispositivos_confianza` (`usuario_id`, `device_token`, `device_name`, `expires_at`).
5. Firma una cookie `trusted_device` (JWT independiente del token de sesión, HTTP-only, `SameSite=Lax`, `max_age` de 30 días).

### Bypass de 2FA

En un login posterior, si la cookie `trusted_device` está presente, es válida y no ha expirado, el sistema emite directamente un `access_token` con `mfa_verified=true`, actualiza `last_used_at` y **omite por completo** la pantalla de verificación 2FA.

### Gestión y revocación

| Acción | Efecto |
| --- | --- |
| `GET /mfa/devices` | Lista todos los dispositivos activos del usuario (nombre, fechas de creación/expiración/último uso) |
| `DELETE /mfa/devices/{device_id}` | Revoca un dispositivo puntual; si coincide con la cookie presente en la request, también la elimina del navegador |
| Desactivar 2FA (`/mfa/disable`) | Revoca **todos** los dispositivos del usuario |
| Cambiar contraseña (`/password/change` o `/password/force-change`) | Revoca **todos** los dispositivos del usuario |
| Restablecimiento de contraseña por un administrador (`/usuarios/{id}/reset-password`) | Revoca **todos** los dispositivos del usuario |
| Cerrar sesión (`/logout`) | **No revoca** el dispositivo — comportamiento intencional |

No existe un proceso automático de purga de dispositivos expirados en la base de datos; los registros vencidos simplemente dejan de ser válidos (la comparación de fecha de expiración falla) pero permanecen almacenados hasta que se eliminen manualmente.

---

## Bloqueo por Intentos Fallidos (Rate Limiting con Redis)

Dos mecanismos independientes de protección contra fuerza bruta, implementados en `redis_service.py`, ambos con **máximo 5 intentos por ventana de 15 minutos**:

| Mecanismo | Clave Redis | Se incrementa cuando... |
| --- | --- | --- |
| Login | `login_attempts:{email}:{ip}` | El email no existe o la contraseña es incorrecta |
| Verificación 2FA | `mfa_attempts:{user_id}:{ip}` | El código TOTP/correo/respaldo es inválido, en `setup`, `verify` o `verify-backup` (no en `/mfa/disable`: pendiente H-16) |

- La clave combina **email/usuario + IP de origen**: el mismo usuario desde otra IP tiene un contador independiente, y viceversa.
- El contador se reinicia (`clear_*_attempts`) al autenticar/verificar exitosamente.
- Al alcanzar el límite, el endpoint responde `429` con un mensaje indicando que debe esperar 15 minutos. Desde la auditoría de nov-2026 el **código HTTP** de los errores de 2FA y contraseña coincide con el campo `code` del cuerpo (`400`/`401`/`403`/`429`); antes respondían HTTP 200 con `"status": "error"`.
- **Comportamiento sin Redis disponible**: el sistema fallará "abierto" — las funciones de conteo y bloqueo degradan a permitir el acceso sin restricción. Esto hace que la disponibilidad de Redis sea un requisito operativo de seguridad, no solo de rendimiento.
- La IP del cliente se obtiene de `request.client.host`, sin lógica de confianza en cabeceras `X-Forwarded-For`; en despliegues detrás de un proxy/load balancer, esto puede hacer que múltiples clientes compartan el mismo cubo de rate limit o que todos caigan bajo una IP `"unknown"`. Si se despliega detrás de un proxy, evalúa incorporar soporte explícito para cabeceras de proxy confiable.

---

## Gestión de Contraseñas y Restablecimiento Administrativo

### Política de complejidad

Aplicada tanto en el cambio de contraseña como en la creación de usuarios: mínimo 8 caracteres, al menos una mayúscula, un número y un símbolo especial (`!@#$%^&*()_-+=[]{};:,.?/<>|~`).

### Cambio voluntario y forzado

`POST /password/change` (voluntario) y `POST /password/force-change` (obligatorio tras creación o restablecimiento) comparten la misma validación y ambos revocan los dispositivos de confianza del usuario al completarse. Errores: `400` (contraseña actual incorrecta, confirmación distinta, cambio no requerido) y `422` (complejidad insuficiente).

`POST /logout` funciona aunque el 2FA o el cambio de contraseña estén pendientes (está excluido del `MFAMiddleware`), de modo que el usuario puede abandonar el flujo y la cookie de sesión se elimina.

> **Excepción del Super Administrador:** la cuenta cuyo email coincide con la variable de entorno `SEED_SUPER_ADMIN_EMAIL` está exceptuada del cambio forzado de contraseña — `MFAMiddleware`, las rutas `force-change`/`mfa-verify` y `GET /mfa/status` ignoran su flag `must_change_password`. Esto evita que un administrador quede bloqueado del panel si el flag se activó por error, pero sigue debiendo completar la verificación 2FA como cualquier otro usuario.

### Restablecimiento por un Administrador

Diseñado para el caso en que un usuario pierde acceso a su cuenta (olvidó su contraseña y no puede autenticarse para cambiarla él mismo):

1. `POST /usuarios/{id}/reset-password` — el Administrador dispara la generación de una contraseña temporal criptográficamente aleatoria (formato `XXXX-XXXX-XXXX`, usando `secrets.token_hex`), la persiste hasheada con Argon2id, activa `must_change_password=true`, **desactiva completamente el 2FA** del usuario (deberá reconfigurarlo desde cero) y revoca sus dispositivos de confianza. La contraseña en texto plano se devuelve **una única vez** en la respuesta — nunca queda almacenada en claro ni se recupera después.
2. `POST /usuarios/{id}/send-temp-password` — paso explícito y separado para enviar esa contraseña temporal al correo del usuario, con una plantilla que distingue si el motivo es una creación de cuenta o un restablecimiento.

### Cuentas de prueba y super administrador (seed)

- No existe una contraseña por defecto del super administrador en el código: se toma de `SEED_SUPER_ADMIN_PASSWORD` o, si falta, se genera una aleatoria y se informa una sola vez en el log de la primera instalación.
- Ya no se siembra ninguna cuenta de prueba. La antigua `casa2301teo@gmail.com` (rol Administrador, contraseña publicada en el código) se neutraliza automáticamente en cada arranque si aún conserva esa contraseña: nueva contraseña aleatoria, cambio obligatorio, 2FA desactivado y dispositivos revocados.
- Los emails aceptados fuera de los dominios corporativos se controlan con `EMAILS_PRUEBA_PERMITIDOS`.

Esta separación en dos pasos permite al administrador comunicar la contraseña por un canal alternativo (por ejemplo, verbalmente o por un canal interno) si el correo no está disponible o no es confiable en ese momento.

---

## Sesión y Tokens JWT

- **Algoritmo**: HS256, firmado con `SECRET_KEY`.
- **Duración**: access token 24 horas; refresh token 7 días (emitido en el login, sin endpoint `/refresh` conectado actualmente — al expirar el access token, el usuario debe volver a iniciar sesión).
- **Transporte**: cookie `access_token` (`HttpOnly`, `SameSite=Lax`, marcada `Secure` automáticamente sobre HTTPS) o header `Authorization: Bearer` (con prioridad si ambos están presentes).
- **Claims**: identidad completa del usuario (nombre, apellidos, RUT, cargo), `rol_id`/`rol_nombre`, `mfa_verified` y `remember_device`. El rol se lee del claim, no se revalida contra la base de datos en cada request — un cambio de rol en BD solo aplica desde el siguiente login del usuario afectado.
- **Middleware MFA**: en cada request, `MFAMiddleware` revisa si el usuario debe cambiar su contraseña o completar el 2FA antes de continuar, redirigiendo a `/force-change` o `/mfa-verify` según corresponda.

---

## Hashing de Contraseñas (Argon2id)

Todas las contraseñas de usuario y todos los códigos de respaldo 2FA se hashean con **Argon2id** (`argon2-cffi`), el algoritmo ganador de la Password Hashing Competition, configurado con:

```
time_cost   = 3
memory_cost = 65536 KiB (64 MiB)
parallelism = 2
hash_len    = 32 bytes
```

El hash resultante es autocontenido (incluye algoritmo, versión, parámetros y salt aleatorio), lo que permite ajustar los parámetros en el futuro sin invalidar los hashes existentes.

---

## Cabeceras de Seguridad HTTP

`SecurityHeadersMiddleware` agrega a **toda** respuesta:

| Cabecera | Valor | Propósito |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | Evita que el navegador reinterprete el tipo de contenido |
| `X-Frame-Options` | `SAMEORIGIN` | Previene *clickjacking*; permite embeber PDFs propios en el mismo origen |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limita la información de referer enviada a terceros |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Deshabilita por defecto el acceso a hardware sensible del navegador |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Fuerza HTTPS una vez el certificado esté activo en producción |
| `Content-Security-Policy` | `default-src 'self'` + fuentes explícitas para scripts/estilos/fuentes/imágenes | Mitiga el impacto de un eventual XSS |

> La política CSP actual permite `'unsafe-inline'` en `script-src` y `style-src` para compatibilidad con el frontend actual (Tailwind CDN + scripts inline). Esto reduce la protección de la CSP contra XSS respecto a una política estricta sin `unsafe-inline` — es un punto a revisar si se migra el frontend a assets empaquetados sin inline scripts/estilos.

Adicionalmente, `CustomCORSMiddleware` restringe qué orígenes externos pueden consumir la API (`CORS_ALLOWED_ORIGINS`), con `allow_credentials=True` para permitir el envío de cookies en solicitudes cross-origin autorizadas.

---

## Enmascarado de Errores

`ErrorMiddleware` y `ErrorHandler` (`app/infrastructure/middleware/error_middleware.py`, `error_handler.py`) garantizan que ninguna excepción no controlada exponga detalles internos (mensajes de SQL, rutas de archivo, stack traces) al cliente de la API:

- Las excepciones `HTTPException` se devuelven tal cual (su mensaje ya es intencional y controlado por el desarrollador).
- Las excepciones no controladas se clasifican por tipo (`ValueError` → 422, `PermissionError` → 403, `FileNotFoundError`/`KeyError` → 404) o por palabras clave del mensaje, y se responde con un **mensaje genérico predefinido**, nunca con `str(e)`.
- El script `verify_error_masking.py` (raíz del proyecto) valida en tiempo de ejecución esta garantía, simulando una excepción con contenido sensible y comprobando que nunca llegue al cliente.

---

## Protección de Documentos PDF

- **Descarga autenticada**: `doc_pdf/`, `PDF_firmados/` y `PDF_autorizaciones/` ya no se sirven como archivos estáticos públicos — todo acceso pasa por `pdf_download_routes.py`, que exige un JWT válido.
- **Prevención de path traversal**: la ruta solicitada se resuelve a una ruta absoluta y se verifica que permanezca dentro de la carpeta permitida antes de servir el archivo (`403` si intenta escapar del directorio).
- **Sanitización de nombres**: todo archivo subido se renombra normalizando caracteres Unicode y añadiendo un identificador único (`uuid4`), evitando colisiones y caracteres problemáticos en el sistema de archivos.
- **Optimización**: cada PDF se procesa con `pikepdf` (linealización y recompresión) al guardarse; si el archivo no puede procesarse, se conserva sin optimizar como resguardo antes de fallar.
- **Sin límite de tamaño explícito**: no existe actualmente una validación de tamaño máximo de archivo a nivel de aplicación — se recomienda imponer un límite a nivel de proxy/servidor si se requiere una cota dura.

---

## Redis: Usos en el Sistema

Redis es un componente de seguridad, no solo de caché, en FlujoPago:

| Uso | Clave | TTL |
| --- | --- | --- |
| Bloqueo de login por fuerza bruta | `login_attempts:{email}:{ip}` | 15 min |
| Bloqueo de verificación 2FA | `mfa_attempts:{user_id}:{ip}` | 15 min |
| Código OTP de correo (2FA) | `email_otp:{user_id}` | 5 min |
| Límite de envío de OTP por correo | `rate_limit_email_otp:{user_id}` | 60 s |

**Si Redis no está disponible**, el sistema no lanza errores fatales, pero **pierde por completo la protección de rate limiting** (login y 2FA quedan sin bloqueo por intentos fallidos) y la verificación por correo deja de funcionar como alternativa al TOTP. Se recomienda monitorear activamente la disponibilidad del contenedor/servicio Redis en producción.

---

## Correo Electrónico (SMTP)

`app/infrastructure/mailing/email_service.py` gestiona todo el envío de correo del sistema, de forma asíncrona (`aiosmtplib`), con las siguientes plantillas:

| Plantilla | Se usa en |
| --- | --- |
| Activación de 2FA (QR + backup codes embebidos) | `POST /mfa/setup` |
| Código OTP de 6 dígitos | `POST /mfa/send-email-otp` |
| Contraseña temporal (creación o restablecimiento) | `POST /usuarios/{id}/send-temp-password` |

**Whitelist de dominios de destino** (`ALLOWED_EMAIL_DOMAINS`): si el dominio del destinatario no está en esta lista, el envío se descarta silenciosamente (se registra en el log, sin lanzar excepción hacia el llamador) — aplica a **todos** los correos del sistema, no solo al registro de usuarios. Esta lista es independiente de los dominios permitidos para *iniciar sesión* (`validaciones.py`), y ambas listas deben mantenerse coherentes manualmente.

**Resiliencia**: si el envío de un correo falla (SMTP caído, credenciales inválidas, dominio no permitido), la operación de negocio que lo originó (crear usuario, restablecer contraseña) **no se revierte** — el cambio en base de datos persiste independientemente del resultado del correo. El administrador puede reintentar el envío en cualquier momento con `POST /usuarios/{id}/send-temp-password`.

---

## Respaldos y Continuidad

### Respaldo local automático (activo por defecto)

El servicio `db-backup` (`docker-compose.yml`, imagen `prodrigestivill/postgres-backup-local`) genera volcados `.sql.gz` de PostgreSQL **diariamente**, con retención escalonada: 7 días, 4 semanas y 12 meses, almacenados en `./backups/db`.

### Plantilla de respaldo completo a AWS S3

`scripts/backup_s3.sh` (comentado paso a paso en español) permite:

1. Respaldar la base de datos con `pg_dump` dentro del contenedor Docker.
2. Comprimir en `.tar.gz` las carpetas de adjuntos (`PDF_autorizaciones/`, `PDF_firmados/`).
3. Subir ambos archivos a un bucket S3 propio (sección comentada intencionalmente, a la espera de credenciales y bucket configurados por el cliente).
4. Purgar localmente los respaldos con más de 15 días de antigüedad.
5. Programarse como tarea `cron` diaria, con log de ejecución en `logs/backup_cron.log`.

> Se recomienda ejecutar al menos una prueba de restauración completa antes de la puesta en producción, y habilitar la sincronización a S3 (u otro almacenamiento externo) para no depender exclusivamente del disco del servidor de aplicación.

---

## Seguridad de Dependencias (CI/CD)

`.github/workflows/security-workflow.yml` implementa un pipeline dedicado a la seguridad de la cadena de suministro de software (dependencias de terceros):

- **Disparadores**: push/PR a `main` (y ramas de trabajo configuradas), ejecución programada diaria a las 02:00 UTC, y ejecución manual (`workflow_dispatch`).
- **Análisis en paralelo**:
  - `safety` — vulnerabilidades conocidas (CVE) en `requirements.txt`.
  - `pip-audit` — auditoría adicional de vulnerabilidades con otra fuente de datos.
  - `outdated` — paquetes con nuevas versiones disponibles.
  - `licenses` — licencias de todas las dependencias de terceros.
  - `sbom` — generación de un Software Bill of Materials (formato CycloneDX).
- **Reporte consolidado**: un job final descarga todos los artefactos y genera un **PDF profesional** con hallazgos clasificados por severidad CVSS:

  | Severidad | CVSS | SLA recomendado |
  | --- | --- | --- |
  | Crítico | 9.0 – 10.0 | 4 horas |
  | Alto | 7.0 – 8.9 | 72 horas |
  | Medio | 4.0 – 6.9 | 1-2 semanas |
  | Bajo | 0.1 – 3.9 | Flexible |

  El PDF se publica como artefacto de GitHub Actions con retención de 90 días.
- **Documentación operativa completa**: guías de configuración, interpretación del reporte y resolución de problemas están disponibles en [`.github/workflows/`](.github/workflows/README.md) (incluye `SECURITY_REPORT_README.md`, `INTERPRETAR_REPORTE.md`, `QUICK_REFERENCE.md`, entre otros).

Este pipeline complementa, pero no reemplaza, una revisión manual periódica: la **detección** de vulnerabilidades está automatizada, pero su **aplicación** (actualizar la dependencia, validar que no rompe funcionalidad y desplegar) requiere intervención de un desarrollador.

---

## Notas de Seguridad y Recomendaciones

Hallazgos documentados de forma transparente para la operación y el mantenimiento futuro del sistema:

- **Configurar siempre `SECRET_KEY` y `FERNET_KEY` en producción** — sus valores por defecto son inseguros y están pensados solo para desarrollo local.
- **`CORS_ALLOWED_ORIGINS` debe apuntar a dominios reales** — el valor de respaldo incluye dominios de ejemplo no válidos para producción.
- **Redis es un componente de seguridad crítico**, no solo de rendimiento: su caída elimina el rate limiting de login/2FA y la verificación por correo.
- **El seed inicial incluye credenciales hardcodeadas** (usuario administrador y un usuario de prueba de 2FA) — deben rotarse o eliminarse antes de operar en producción.
- **El RUT solo se valida por formato**, no se calcula el dígito verificador matemáticamente — el sistema acepta RUTs con formato correcto pero dígito verificador inválido.
- **La whitelist de dominios de login (`validaciones.py`) y la whitelist de dominios de envío de correo (`ALLOWED_EMAIL_DOMAINS`) son independientes** y deben mantenerse sincronizadas manualmente si se agregan nuevos dominios corporativos.
- **Dos endpoints de histórico no aplican el filtrado por rol/obra** (`/historico/estado/{estado}`, `/historico/solicitante/{solicitante}`) — cualquier usuario autenticado puede consultarlos sin restricción de propiedad.
- **No hay límite de tamaño de archivo** en la carga de PDFs a nivel de aplicación — considerar imponerlo en el reverse proxy si es un requisito.
