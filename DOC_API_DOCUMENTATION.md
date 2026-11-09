# Documentación de la API — FlujoPago

Referencia completa de la API REST de FlujoPago. Todos los endpoints están montados bajo el prefijo:

```
/flujopago/gestion-pagos/v1
```

La documentación interactiva (Swagger UI) está disponible en `/docs` y el esquema OpenAPI en `/openapi.json` sobre cualquier instancia en ejecución.

---

## Tabla de Contenido

- [Formato Estándar de Respuesta](#formato-estándar-de-respuesta)
- [Autenticación](#autenticación)
- [Autenticación y Sesión (`/login`, `/logout`)](#autenticación-y-sesión-login-logout)
- [Autenticación de Dos Factores (`/mfa/*`)](#autenticación-de-dos-factores-mfa)
- [Contraseñas (`/password/*`)](#contraseñas-password)
- [Usuarios (`/usuarios`)](#usuarios-usuarios)
- [Empresas (`/empresas`)](#empresas-empresas)
- [Roles (`/roles`)](#roles-roles)
- [Procesos (`/procesos`)](#procesos-procesos)
- [Procesos Auxiliares / Obras (`/procesos_auxiliares`)](#procesos-auxiliares--obras-procesos_auxiliares)
- [Solicitudes (`/todas_solicitudes`)](#solicitudes-todas_solicitudes)
- [Recepcionados (`/recepcionado`)](#recepcionados-recepcionado)
- [Histórico (`/historico`)](#histórico-historico)
- [PDF Firmado (`/pdf-firmado`)](#pdf-firmado-pdf-firmado)
- [PDF Registro de Autorización (`/pdf-registro-autorizacion`)](#pdf-registro-de-autorización-pdf-registro-autorizacion)
- [Descarga de PDF](#descarga-de-pdf)
- [Paginación](#paginación)
- [Reglas de autorización por registro](#reglas-de-autorización-por-registro)
- [Códigos de Error Comunes](#códigos-de-error-comunes)

---

## Formato Estándar de Respuesta

Todas las respuestas JSON (éxito y error) siguen el mismo contrato, aplicado automáticamente por `ResponseWrapperMiddleware` cuando el handler no lo construye explícitamente.

**Éxito:**

```json
{
  "status": "success",
  "code": 200,
  "timestamp": "2026-07-09T10:30:00-03:00",
  "path": "/flujopago/gestion-pagos/v1/usuarios",
  "method": "GET",
  "message": "Operación exitosa",
  "data": { }
}
```

**Error:**

```json
{
  "status": "error",
  "code": 404,
  "timestamp": "2026-07-09T10:30:05-03:00",
  "path": "/flujopago/gestion-pagos/v1/usuarios/999",
  "method": "GET",
  "message": "Usuario no encontrado",
  "errors": [{ "field": "id", "code": "not_found", "message": "No existe un usuario con ese ID" }]
}
```

Los endpoints que devuelven archivos binarios (descarga de PDF) responden con `StreamingResponse` y no siguen este formato.

> **Código HTTP = campo `code`** (auditoría nov-2026, H-29). Antes, varios endpoints de `/mfa/*`, `/password/*` y `/usuarios/{id}/send-temp-password` devolvían errores con **HTTP 200** y `"status": "error"` en el cuerpo. Ahora el código HTTP coincide con `code`; el cuerpo no cambió. El cliente React (`frontend/src/api/client.ts`) maneja ambos casos.

---

## Autenticación

La mayoría de los endpoints requieren un JSON Web Token válido, enviado de una de estas dos formas (con prioridad al header si ambas están presentes):

```http
Authorization: Bearer <access_token>
```

o mediante la cookie `access_token` (`HttpOnly`, `SameSite=Lax`), establecida automáticamente por `/login`.

| Dependencia | Uso | Error si falla |
| --- | --- | --- |
| `get_current_user` | Exige un JWT válido, sin restricción de rol | `401` |
| `require_admin` | Exige además `rol_nombre == "Administrador"` | `401` / `403` |
| `require_role([...])` | Exige que el rol esté en la lista indicada | `401` / `403` |

Además de estas dependencias, las reglas **a nivel de registro** (propiedad, transiciones de estado permitidas y roles del flujo) están centralizadas en `app/infrastructure/security/permisos.py`. Ver [Reglas de autorización por registro](#reglas-de-autorización-por-registro).

El JWT expira a las 24 horas (`ACCESS_TOKEN_EXPIRE`). No hay endpoint de renovación (`/refresh`) implementado actualmente — al expirar, el usuario debe iniciar sesión nuevamente.

---

## Autenticación y Sesión (`/login`, `/logout`)

Router: `dashboard_routes.py`

### `POST /login`

Autentica un usuario con email y contraseña. No requiere autenticación previa.

**Body** (`LoginIn`):

```json
{
  "email": "usuario@flujopago.cl",
  "password": "MiPassword123!",
  "remember_device": false
}
```

| Campo | Tipo | Notas |
| --- | --- | --- |
| `email` | string | Debe pertenecer a `@flujopago.cl`/`@grupodemo.cl` o a un dominio/cuenta de prueba autorizado |
| `password` | string | — |
| `remember_device` | boolean | Si es `true`, tras completar el 2FA se registra un dispositivo de confianza (30 días) |

**Respuesta 200:**

```json
{
  "status": "success",
  "message": "Login exitoso",
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "bearer"
  }
}
```

Además se establece la cookie `access_token`. Si existe una cookie `trusted_device` vigente para este usuario, el token emitido ya incluye `mfa_verified=true` (bypass automático del 2FA).

**Errores:**

| Código | Causa |
| --- | --- |
| `400` | Falta `email` o `password` |
| `404` | El email no está registrado |
| `401` | Contraseña incorrecta |
| `429` | Más de 5 intentos fallidos en los últimos 15 minutos para este email + IP |
| `500` | Error inesperado (mensaje genérico; el detalle solo queda en el log) |

### `POST /logout`

Cierra la sesión actual. Borra la cookie `access_token`. **No** revoca el dispositivo de confianza (la cookie `trusted_device`, si existe, permanece intacta intencionalmente). Funciona también con el 2FA o el cambio de contraseña pendientes (la ruta está excluida del `MFAMiddleware`).

### `GET /login`, `GET /`, `GET /dashboard`, `GET /force-change`, `GET /mfa-verify`

Rutas heredadas del frontend Jinja2: hoy **redirigen (302) a la SPA React** (`/flujopago/gestion-pagos/v1/app/...`), preservando la query string. `/dashboard` conserva `get_current_user` (sin sesión, redirige a `/?error=session_expired`).

---

## Autenticación de Dos Factores (`/mfa/*`)

Router: `mfa_routes.py`. Todos los endpoints requieren `get_current_user`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/mfa/status` | Estado actual de 2FA del usuario |
| `POST` | `/mfa/setup` | Genera secreto TOTP, QR y 10 códigos de respaldo |
| `POST` | `/mfa/verify-setup` | Confirma la activación con el primer código válido |
| `POST` | `/mfa/send-email-otp` | Envía un código de 6 dígitos por correo como alternativa al TOTP |
| `POST` | `/mfa/verify` | Verifica el código 2FA en una sesión ya iniciada |
| `POST` | `/mfa/verify-backup` | Verifica usando un código de respaldo (uso único) |
| `POST` | `/mfa/disable` | Desactiva el 2FA y revoca todos los dispositivos de confianza |
| `GET` | `/mfa/devices` | Lista los dispositivos de confianza del usuario |
| `DELETE` | `/mfa/devices/{device_id}` | Revoca un dispositivo de confianza específico |

### `GET /mfa/status`

**Respuesta 200** (`MFAStatusResponse`):

```json
{
  "data": {
    "mfa_enabled": true,
    "mfa_verified_at": "2026-07-01T09:00:00",
    "must_change_password": false
  }
}
```

> Para el usuario Super Administrador (email definido en `SEED_SUPER_ADMIN_EMAIL`), `must_change_password` se reporta siempre como `false` sin importar el valor real almacenado, ya que esta cuenta está exceptuada del cambio forzado de contraseña.

### `POST /mfa/setup`

Sin body. Falla con `400` si el usuario ya tiene el 2FA activado.

**Respuesta 200:**

```json
{
  "data": {
    "qr_code_base64": "data:image/png;base64,...",
    "backup_codes": ["A1B2-C3D4", "..."],
    "provisioning_uri": "otpauth://totp/FlujoPago:usuario@flujopago.cl?secret=...&issuer=FlujoPago"
  }
}
```

Los `backup_codes` en texto plano y el QR también se envían por correo (plantilla de activación). Este es el **único momento** en que los códigos de respaldo son visibles en texto plano — quedan hasheados con Argon2id en base de datos a partir de aquí.

### `POST /mfa/verify-setup`

**Body** (`MFAVerifyRequest`):

```json
{ "code": "123456" }
```

Acepta indistintamente un código TOTP de la app o un OTP de correo previamente solicitado. En éxito, activa `mfa_enabled=true`, emite un nuevo `access_token` con `mfa_verified=true` (actualiza la cookie) y, si `remember_device=true` estaba presente en el token de login, registra el dispositivo de confianza.

**Errores:** `400` (código inválido / secreto no generado aún), `429` (rate limit, 5 intentos/15 min).

### `POST /mfa/send-email-otp`

Sin body. Genera un código numérico de 6 dígitos, lo almacena en Redis (TTL 5 minutos) y lo envía por correo al email del usuario autenticado.

**Respuesta 200:**

```json
{ "data": { "email_hint": "usu***@flujopago.cl" }, "message": "Código enviado." }
```

**Errores:** `429` si ya se envió un código en el último minuto para este usuario.

### `POST /mfa/verify`

Igual contrato que `verify-setup`, pero exige que el usuario ya tenga `mfa_enabled=true`. Usado en cada nuevo inicio de sesión que requiera 2FA.

**Errores:** `400` (2FA no habilitado), `401` (código inválido), `429` (rate limit).

### `POST /mfa/verify-backup`

**Body** (`MFABackupVerifyRequest`):

```json
{ "backup_code": "A1B2-C3D4" }
```

El código se consume (elimina de la lista) tras un uso exitoso. **Errores:** `401` (código inválido o ya usado), `429` (rate limit).

### `POST /mfa/disable`

**Body:** `{ "code": "123456" }` (TOTP o OTP de correo). **Requiere que el JWT actual tenga `mfa_verified=true`** — si no, `403`. Desactiva completamente el 2FA y elimina todos los dispositivos de confianza asociados. **Errores:** `400` (2FA no habilitado), `401` (código inválido), `403`.

> Pendiente conocido (H-16, MEDIO): este endpoint no aplica límite de intentos.

### `GET /mfa/devices`

**Respuesta 200:**

```json
{
  "data": [
    { "id": 5, "device_name": "Chrome en Windows", "created_at": "...", "expires_at": "...", "last_used_at": "..." }
  ]
}
```

### `DELETE /mfa/devices/{device_id}`

Revoca un dispositivo específico. `404` si el `device_id` no pertenece al usuario autenticado. Si el dispositivo revocado coincide con la cookie `trusted_device` presente en la request, también se borra dicha cookie.

---

## Contraseñas (`/password/*`)

Router: `password_routes.py`. Ambos endpoints requieren `get_current_user` y usan la misma política de complejidad (mínimo 8 caracteres, mayúscula, número y símbolo especial).

### `POST /password/change`

**Body:**

```json
{ "old_password": "...", "new_password": "...", "confirm_password": "..." }
```

Cambio voluntario. `400` si `old_password` es incorrecta o si `new_password` ≠ `confirm_password`. Revoca todos los dispositivos de confianza del usuario.

### `POST /password/force-change`

Mismo body. Exige que `must_change_password=true` en el usuario (`400` en caso contrario, "No es necesario un cambio de contraseña obligatorio."). Accesible sin `mfa_verified=true` — el `MFAMiddleware` excluye explícitamente esta ruta para permitir completar el cambio antes de configurar el 2FA.

---

## Usuarios (`/usuarios`)

Router: `usuario_routes.py`.

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| `GET` | `/usuarios` | `require_admin` | Lista todos los usuarios (solo Administración; antes cualquier usuario autenticado) |
| `POST` | `/usuarios` | `require_admin` | Crea un usuario nuevo |
| `PUT` | `/usuarios/{id}` | `require_admin` | Modifica un usuario existente |
| `DELETE` | `/usuarios/{id}` | `require_admin` | Elimina un usuario |
| `POST` | `/usuarios/{id}/reset-password` | `require_admin` | Restablece la contraseña y revoca 2FA/dispositivos |
| `POST` | `/usuarios/{id}/send-temp-password` | `require_admin` | Envía por correo la contraseña temporal |

### `GET /usuarios`

**Query:** `limit`, `offset` (opcionales, ver [Paginación](#paginación)).

**Respuesta 200** (`list[UsuariosOut]`):

```json
{
  "data": [
    {
      "id": 1,
      "cargo": "Jefe de Finanzas",
      "nombre_1": "Juan", "nombres_2": null,
      "apellido_1": "Pérez", "apellido_2": "González",
      "email": "juan.perez@flujopago.cl",
      "rol_id": 1, "rol_nombre": "Administrador",
      "rut": "12345678-9",
      "obras_ids": [176, 197],
      "created_at": "2026-01-10T09:00:00"
    }
  ]
}
```

### `POST /usuarios`

**Body** (`UsuariosIn`):

```json
{
  "cargo": "Analista de personal",
  "nombre_1": "María", "nombres_2": null,
  "apellido_1": "Soto", "apellido_2": "Rivas",
  "email": "maria.soto@flujopago.cl",
  "rol_id": 2,
  "rut": "98765432-1",
  "obras_ids": [176]
}
```

| Campo | Reglas de validación |
| --- | --- |
| `cargo` | Enum `CargosDisponibles`: Jefe de Recursos Humanos, Subgerente de Capital Humano, Analista de personal, Jefe de Finanzas, Administrador |
| `nombre_1` / `apellido_1` | 2-50 caracteres, sin dígitos |
| `email` | Dominio `@flujopago.cl`/`@grupodemo.cl` (o excepción de prueba autorizada) |
| `rut` | Formato `\d{7,8}-[\dkK]` (solo validación de formato, sin verificar el dígito verificador matemáticamente) |
| `obras_ids` | Lista de IDs de `procesos_auxiliares`; por defecto vacía |

**Respuesta 200/201:** el objeto `UsuariosOut` más `temp_password` (contraseña temporal generada automáticamente, formato `XXXX-XXXX-XXXX`, visible **una sola vez** en esta respuesta). El usuario se crea con `must_change_password=true`.

**Errores:** `400` si el RUT o el email ya existen (mensaje específico), o si el rol/obra indicado no existe (sin datos parciales: se revierte todo); `422` si la validación del esquema falla.

### `PUT /usuarios/{id}`

Mismo body que `POST`. Reemplaza también las obras asignadas (borra e inserta la relación completa). **Errores:** `404` si el usuario no existe; `400` si el email/RUT pertenece a otro usuario o el rol/obra no existe (rollback completo, obras intactas).

### `DELETE /usuarios/{id}`

**Errores:** `404` si no existe; `409` si el usuario tiene solicitudes, recepcionados o histórico asociados (antes `500`).

### `POST /usuarios/{id}/reset-password`

Sin body. Genera una nueva contraseña temporal, activa `must_change_password=true`, **desactiva completamente el 2FA** del usuario y revoca todos sus dispositivos de confianza.

**Respuesta 200:**

```json
{ "data": { "id": 7, "nombre_1": "María", "apellido_1": "Soto", "email": "maria.soto@flujopago.cl", "temp_password": "A1B2-C3D4-E5F6" } }
```

### `POST /usuarios/{id}/send-temp-password`

**Body:**

```json
{ "temp_password": "A1B2-C3D4-E5F6", "motivo": "restablecimiento" }
```

`motivo` acepta `"creación"` (default) o `"restablecimiento"` — determina el asunto y el texto de la plantilla de correo. **Errores:** `404` (usuario inexistente), `502` (fallo de envío SMTP o dominio no permitido), `500` (excepción inesperada).

---

## Empresas (`/empresas`)

Router: `empresa_routes.py`.

| Método | Ruta | Auth | Body / Notas |
| --- | --- | --- | --- |
| `GET` | `/empresas` | `get_current_user` | Paginado |
| `POST` | `/empresas` | `require_admin` | `{ "empresa": "string(2-150)", "codigo": "string(2-20)" }`. `400` si el nombre o el código ya existen |
| `PUT` | `/empresas/{id}` | `require_admin` | Mismo body. `404` si no existe; `400` si nombre/código pertenecen a otra empresa |
| `DELETE` | `/empresas/{id}` | `require_admin` | `404` si no existe |

---

## Roles (`/roles`)

Router: `roles_routes.py`.

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| `GET` | `/roles` | `get_current_user` | Lista paginada, `{ "id": 1, "nombre": "Administrador" }` |

No hay endpoints de creación/edición/eliminación activos para roles en la versión actual (los roles se gestionan vía el seed inicial).

---

## Procesos (`/procesos`)

Router: `procesos_routes.py`.

| Método | Ruta | Auth | Body / Notas |
| --- | --- | --- | --- |
| `GET` | `/procesos` | `get_current_user` | Paginado |
| `POST` | `/procesos` | `require_admin` | `{ "nombre", "proceso", "cuenta_objeto", "auxiliar"?, "estado": "ACTIVO"|"INACTIVO" }` |
| `PUT` | `/procesos/{id}` | `require_admin` | Mismo body. `404` si no existe |
| `DELETE` | `/procesos/{id}` | `require_admin` | `404` si no existe |

`nombre` y `proceso` se normalizan a mayúsculas al guardar. Un error de base de datos al crear (p.ej. largo excedido) responde `400` con un mensaje genérico, sin texto SQL.

---

## Procesos Auxiliares / Obras (`/procesos_auxiliares`)

Router: `procesos_auxiliare_routes.py`.

| Método | Ruta | Auth | Body / Notas |
| --- | --- | --- | --- |
| `GET` | `/procesos_auxiliares` | `get_current_user` | Filtrado por obras asignadas si el rol no es Administrador/Supervisor |
| `POST` | `/procesos_auxiliares` | `require_admin` | `{ "numero": "2-20 chars", "detalle": "2-150 chars", "auxiliar": "2-20 chars", "estado": "ACTIVO"|"INACTIVO" }` |
| `PUT` | `/procesos_auxiliares/{id}` | `require_admin` | Valida unicidad de `numero`, `detalle` y `auxiliar` contra otros registros |
| `DELETE` | `/procesos_auxiliares/{id}` | `require_admin` | `404` si no existe |

**Errores propios de `PUT`:** `400` con mensaje específico si `numero`, `detalle` o `auxiliar` colisionan con otro registro existente.

---

## Solicitudes (`/todas_solicitudes`)

Router: `todas_solicitudes_routes.py` — núcleo del flujo de aprobación de pagos.

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| `GET` | `/todas_solicitudes` | `get_current_user` | Lista con filtro de visibilidad por rol/cargo/obra |
| `POST` | `/todas_solicitudes` | `get_current_user` | Crea una solicitud (multipart, hasta 5 folios con PDF) |
| `PATCH` | `/todas_solicitudes/{id}` | `get_current_user` | Actualiza campos y/o el estado (aprobación/rechazo) |
| `POST` | `/todas_solicitudes/{id}/pdf` | `get_current_user` | Agrega un PDF a un folio específico |
| `DELETE` | `/todas_solicitudes/{id}/pdf` | `get_current_user` | Elimina el PDF de un folio específico |
| `DELETE` | `/todas_solicitudes/{id}` | `get_current_user` | Elimina la solicitud (y sus PDFs, salvo `preserve_files=true`) |

### `GET /todas_solicitudes`

**Query:** `limit`, `offset`.

**Regla de visibilidad:** si el `rol_nombre` del usuario no es Administrador/Supervisor/Responsable Finanzas **y** su `cargo` no es Jefe de RRHH/Subgerente de Capital Humano/Jefe de Finanzas, solo ve las solicitudes propias **y** que pertenezcan a una de sus obras asignadas. Sin obras asignadas, no ve ningún registro. "Propia" = `usuario_id` del usuario, o nombre coincidente (retrocompatibilidad) **salvo** que el `usuario_id` del registro sea de otra persona con el mismo nombre (homónimo, H-06).

**Sin `limit`/`offset` se retornan todos los registros** (ordenados por `id`), hasta el tope de seguridad `LISTADO_MAX_REGISTROS` (10 000 por defecto; si se alcanza queda advertencia en el log). Ver [Paginación](#paginación).

### `POST /todas_solicitudes`

**Content-Type:** `multipart/form-data`.

| Campo de formulario | Tipo | Notas |
| --- | --- | --- |
| `solicitante` | string | Para usuarios sin rol de gestión debe ser su propio nombre (sin distinguir mayúsculas/espacios); si no coincide, se registra el nombre de la sesión (H-06). Administrador, Supervisor, Responsable Finanzas, Jefe de Finanzas y Jefe de RRHH pueden registrar a nombre de otro |
| `fecha_solicitud` | date | — |
| `folio` | list[string] | Hasta 5 folios por solicitud |
| `montos_por_folio` | list[float] | Debe corresponder en orden a `folio`. No se aceptan negativos (`400`) |
| `empresa`, `obra`, `proceso` | string | `obra` debe estar entre las obras permitidas del usuario si no tiene rol/cargo elevado |
| `monto` | float | Se recalcula igualmente como suma de `montos_por_folio` |
| `reviso` | string | — |
| `mes_de_proceso`, `anio` | string, int | — |
| `cuenta_contable`, `auxiliar` | string | — |
| `fecha_de_pago` | date | — |
| `unidad_de_negocio` | string | — |
| `glosa`, `observaciones` | string (opcionales) | — |
| `estado` | string (opcional) | Usuarios sin rol de gestión solo pueden crear en `ESPERANDO` o `PENDIENTE` (`403` en otro caso). El frontend envía `ESPERANDO` |
| `forma_pago` | list[string] | Valores del enum `Forma_Pago` (`DEPOSITO`, `VALE VISTA`, `DEPOSITO Y VALE VISTA`, `DEVOLUCION - VALE VISTA`, `DEVOLUCION - DEPOSITO`) |
| `pdfs` | list[file] | Cada archivo debe nombrarse con el prefijo del folio correspondiente (`"{FOLIO}_nombreoriginal.pdf"`) para asociarse automáticamente al campo correcto. Siempre se almacenan con extensión `.pdf`. Si la solicitud se rechaza (400), los archivos ya guardados se eliminan |

**Validación de unicidad:** cada folio se valida contra `tabla_todas_solicitudes`, `tabla_recepcionados` y `tabla_historico` — si ya existe (salvo la excepción de histórico del mismo solicitante+empresa), la creación falla con `400`.

`fecha_emision` se asigna con la fecha del día de cada inserción.

**Errores:** `400` (validación Pydantic fallida, folio duplicado), `403` (obra fuera de las asignadas al usuario, o estado inicial no permitido).

### `PATCH /todas_solicitudes/{id}`

Mecanismo de **aprobación/rechazo**. Todos los campos son opcionales (`Todas_SolicitudesUpdate`).

**Estados válidos** (`EstadoSolicitud`): `PENDIENTE`, `ESPERANDO`, `RECHAZADO`, `APROBADO NIVEL 1`, `APROBADO NIVEL 2`, `APROBADO FINANZAS`, `RECEPCIONADO`, `PAGADO`.

```json
{ "estado": "APROBADO NIVEL 1", "observaciones": "Validado por finanzas" }
```

**Regla de autorización:** si el rol no es Administrador/Supervisor/Responsable Finanzas/Aprobador y el cargo no es Jefe de Finanzas, solo puede modificar solicitudes propias (`403` en caso contrario) y **solo con estas transiciones de `estado`** (H-01):

| Estado actual | Estado destino permitido al dueño | Origen en el frontend |
| --- | --- | --- |
| Cualquiera | el mismo, `PENDIENTE`, `ESPERANDO` | Enviar / reenviar a aprobación |
| `PENDIENTE` | `APROBADO NIVEL 1` | "Modificar y reenviar" si fue devuelta (`modificacion_solicitud=true`) o es `tipo_solicitud="Recepcionado"` |
| `APROBADO NIVEL 1` | `APROBADO NIVEL 2` | "Modificar y reenviar" si fue devuelta (`modificacion_solicitud=true`) |

Cualquier otro destino (`RECHAZADO`, `APROBADO FINANZAS`, `RECEPCIONADO`, `PAGADO`, saltos de nivel) es exclusivo de los roles del flujo → `403`.

**Reglas de negocio:**

- `solicitante`/`usuario_id` no pueden sobrescribirse.
- `monto` es inmutable: si se envía, se ignora (el frontend reenvía el mismo valor).
- Debe quedar al menos un folio: vaciar todos responde `400` (antes `500`).
- La suma de los folios modificados no puede exceder el monto original inmutable (`400` si lo excede).
- Un cambio de `estado` genera automáticamente un registro en el histórico.

> No existe un endpoint de aprobación masiva — cada solicitud se aprueba/rechaza con una llamada `PATCH` individual.

### `POST /todas_solicitudes/{id}/pdf`

**Form:** `field_name` (uno de `pdf_folio_uno`...`pdf_folio_cinco`), **File:** `pdf` (debe ser `application/pdf`, `400` si no). Misma autorización que `PATCH` (gestores del flujo o dueño). **Errores:** `404` (solicitud inexistente), `403` (sin permiso sobre la solicitud), `400` (`field_name` inválido o tipo de archivo incorrecto).

### `DELETE /todas_solicitudes/{id}/pdf`

**Query:** `field_name`, `pdf_path` (debe coincidir exactamente con la ruta almacenada). Misma autorización que `PATCH`. **Errores:** `404` (sin PDF que borrar), `403`, `400` (`field_name` inválido o ruta no coincide).

### `DELETE /todas_solicitudes/{id}`

**Query:** `preserve_files` (bool, default `false`). Misma regla de propiedad que `PATCH`. Si `preserve_files=false`, elimina también los archivos físicos asociados.

---

## Recepcionados (`/recepcionado`)

Router: `recepcionado_routes.py` — solicitudes devueltas al solicitante para corrección.

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| `GET` | `/recepcionado` | `get_current_user` | Lista con filtro por rol/cargo/obra |
| `POST` | `/recepcionado` | Administrador, Supervisor, Responsable Finanzas o cargo Jefe de Finanzas | Crea un recepcionado (recepción desde Finanzas) |
| `PATCH` | `/recepcionado/{id}` | `get_current_user` | Actualiza un recepcionado |
| `POST` | `/recepcionado/{id}/guardar-como-solicitud` | `get_current_user` | Convierte en una nueva solicitud independiente |
| `POST` | `/recepcionado/{id}/reenviar` | `get_current_user` | Mueve el registro de vuelta a `todas_solicitudes` |
| `POST` | `/recepcionado/{id}/pdf` | `get_current_user` | Agrega un PDF a un folio |
| `DELETE` | `/recepcionado/{id}/pdf` | `get_current_user` | Elimina el PDF de un folio |

### `GET /recepcionado`

Regla adicional: los usuarios con rol `Solicitante` ven solo lo suyo y **excluyen** los registros en estado `PAGADO`; el resto de roles sin visibilidad elevada ven todos los recepcionados de sus obras asignadas (sin filtrar por identidad).

### `POST /recepcionado`

**Body** (`RecepcionadoIn`, similar a `Todas_SolicitudesIn` pero con `fecha_emision` obligatoria y `tipo_solicitud` del enum `Estado_solicitud`). Solo roles de Finanzas/Administración (`403` en otro caso). El `usuario_id` se toma del **dueño de la solicitud de origen** (`id_solicitud_origen`, que envía el frontend); si no hay origen identificable, se usa el usuario autenticado. Cualquier `usuario_id` enviado se ignora. Si trae `pdf_firmado`, el estado se fuerza a `PAGADO`.

### `PATCH /recepcionado/{id}`

Solo Administrador/Supervisor pueden editar recepcionados de terceros; el resto requiere ser el propietario (`403` en caso contrario). `404` si no existe.

### `POST /recepcionado/{id}/guardar-como-solicitud`

Inserta una nueva solicitud (`tipo_solicitud="Recepcionado"`, `estado="PENDIENTE"` siempre — se ignora el estado enviado —, `reviso="Jefe de Recursos Humanos"`) y elimina el recepcionado original, en una transacción. Permitido al dueño del recepcionado o a usuarios de alta visibilidad (`403` en otro caso). Si la inserción falla, se revierte todo y responde `400` con mensaje genérico.

**Respuesta 200:**

```json
{ "data": { "nueva_solicitud_id": 88, "recepcionado_eliminado": true } }
```

### `POST /recepcionado/{id}/reenviar`

Operación transaccional: exige que el `folio` del body coincida con el del recepcionado (`400` en caso contrario), borra el recepcionado e inserta en `tabla_todas_solicitudes` con `estado="RECHAZADO"`, preservando el solicitante y usuario originales. Rollback automático ante error de base de datos. Misma autorización que `guardar-como-solicitud`.

### `POST` / `DELETE` `/recepcionado/{id}/pdf`

Mismo contrato que los equivalentes en `todas_solicitudes`; autorización: dueño del recepcionado o alta visibilidad (`403`).

---

## Histórico (`/historico`)

Router: `historico_routes.py` — solo lectura, auditoría de cambios de estado.

| Método | Ruta | Auth | Filtro de visibilidad |
| --- | --- | --- | --- |
| `GET` | `/historico/solicitud/{id_solicitud}` | `get_current_user` | Por rol/cargo/obra |
| `GET` | `/historico` | `get_current_user` | Por rol/cargo/obra; sin `limit` retorna todo (tope `LISTADO_MAX_REGISTROS`), con `limit` máximo 500 |
| `GET` | `/historico/estado/{estado}` | `get_current_user` | Por rol/cargo/obra |
| `GET` | `/historico/solicitante/{solicitante}` | `get_current_user` | Por rol/cargo/obra (búsqueda `ILIKE`) |
| `GET` | `/historico/estadisticas` | `get_current_user` | Agregados calculados solo sobre los registros visibles para el usuario |

> Desde la auditoría de nov-2026 (H-05b) las 5 rutas aplican el mismo filtro de alcance; antes `/estado`, `/solicitante` y `/estadisticas` exponían el histórico completo a cualquier usuario autenticado.

`GET /historico/estado/{estado}` valida contra: `PENDIENTE`, `RECHAZADO`, `APROBADO NIVEL 1`, `APROBADO NIVEL 2`, `APROBADO FINANZAS`, `RECEPCIONADO`, `PAGADO` (`400` si el valor no está en esta lista; `ESPERANDO` no se registra en histórico).

`GET /historico/estadisticas` devuelve totales, desglose por estado, la solicitud con más cambios registrados y la fecha del último cambio, dentro del alcance del usuario.

---

## PDF Firmado (`/pdf-firmado`)

Router: `pdf_firmado_routes.py`. **Autorización:** solo roles del flujo (Administrador, Supervisor, Aprobador, Responsable Finanzas o cargos Jefe de RRHH / Subgerente de Capital Humano / Jefe de Finanzas); `403` para Solicitantes.

### `POST /pdf-firmado/upload`

**Form:** `ids` (string JSON con un array de **enteros**), `origen` (opcional: `"solicitud"` por defecto, o `"recepcionado"`), **File:** `pdf` (`application/pdf`).

```json
// valor de "ids"
[12, 15, 20]
```

Guarda el PDF en `PDF_firmados/` y actualiza el campo `pdf_firmado` **solo en la tabla indicada por `origen`** para todos los IDs, en una sola operación transaccional (si falla, el archivo guardado se elimina).

> **Cambio H-26:** antes los IDs se aplicaban a la vez en `tabla_todas_solicitudes` y `tabla_recepcionados`, que tienen secuencias independientes: el PDF de la solicitud N quedaba también en el recepcionado N (otro registro). El frontend siempre envía IDs de solicitudes, por lo que no requiere cambios.

**Respuesta 200:**

```json
{ "data": { "pdf_path": "PDF_firmados/12_documento_ab12cd34.pdf" }, "message": "PDF asociado correctamente a 3 solicitudes" }
```

**Errores:** `400` (`ids` no es un JSON array de enteros o está vacío, `origen` inválido, tipo de archivo incorrecto), `403`, `500` (fallo transaccional, mensaje genérico).

### `DELETE /pdf-firmado/delete/{id}`

**Query:** `origen` (opcional, `"solicitud"` por defecto). Pone en `NULL` el `pdf_firmado` del registro `id` de esa tabla y de sus filas del histórico (mismo `id_solicitud_origen` **y** mismo folio), y elimina el archivo físico. No toca el registro homónimo de la otra tabla. `404` si el registro no tiene PDF firmado.

---

## PDF Registro de Autorización (`/pdf-registro-autorizacion`)

Router: `pdf_registro_autorizacion_routes.py`. Mismo contrato y autorización que PDF Firmado (incluido `origen`), con dos diferencias:

- Guarda en la carpeta `PDF_autorizaciones/`.
- El `upload` **reemplaza** el PDF anterior: actualiza la tabla de origen y sus filas del histórico (id + folio) en la misma transacción y, solo después de confirmarla, elimina físicamente los archivos anteriores.

| Método | Ruta |
| --- | --- |
| `POST` | `/pdf-registro-autorizacion/upload` |
| `DELETE` | `/pdf-registro-autorizacion/delete/{id}` |

---

## Descarga de PDF

Router: `pdf_download_routes.py`.

| Método | Ruta | Carpeta servida |
| --- | --- | --- |
| `GET` | `/doc_pdf/{filename}` | `doc_pdf/` |
| `GET` | `/PDF_firmados/{filename}` | `PDF_firmados/` |
| `GET` | `/PDF_autorizaciones/{filename}` | `PDF_autorizaciones/` |

Requieren `get_current_user`. La ruta resuelta se valida contra la carpeta permitida para prevenir *path traversal* (`403` si el archivo resuelto queda fuera de la carpeta; `404` si no existe). La respuesta es un `StreamingResponse`, no sigue el formato JSON estándar: los PDF se sirven `inline` como `application/pdf`; cualquier otro tipo (p.ej. un `.html` heredado de antes de la corrección H-03) se entrega como `application/octet-stream` con `Content-Disposition: attachment`, nunca como HTML.

---

## Paginación

Los endpoints de listado aceptan los parámetros de query opcionales `limit` y `offset`:

- **Sin `limit` ni `offset`: se retornan todos los registros**, ordenados por `id` (o por el orden propio del endpoint, p.ej. histórico por fecha descendente), hasta el tope de seguridad configurable `LISTADO_MAX_REGISTROS` (10 000 por defecto). Si se alcanza el tope, se registra una advertencia en el log. Antes (H-04) se truncaba **silenciosamente** a 200 filas sin orden, y el frontend —que no pagina— perdía registros.
- Con `limit`/`offset` explícitos: `limit` se recorta al máximo del endpoint (200, o 500 en `/historico`); si solo se envía `offset`, `limit` vale 50.
- `limit` u `offset` negativos responden `422` (antes `500`).
- La respuesta actual **no incluye metadatos de paginación** (`total`, `has_next`) en el body — solo el arreglo de resultados en `data`.

```
GET /flujopago/gestion-pagos/v1/usuarios?limit=20&offset=40
```

---

## Códigos de Error Comunes

| Código | Significado general en FlujoPago |
| --- | --- |
| `400` | Validación de datos fallida, regla de negocio incumplida (folio duplicado, monto excedido, etc.) |
| `401` | Token ausente, inválido o expirado |
| `403` | Rol/cargo/propiedad insuficiente para la operación, transición de estado no permitida, o intento de acceso fuera de carpeta permitida (PDF) |
| `404` | Recurso no encontrado (usuario, solicitud, dispositivo, PDF, etc.) |
| `409` | Conflicto de integridad (p.ej. eliminar un usuario con solicitudes asociadas) |
| `422` | Error de validación de esquema Pydantic detectado automáticamente por FastAPI |
| `429` | Bloqueo por intentos fallidos de login/2FA, o límite de envío de OTP por correo |
| `500` | Error interno no controlado — el mensaje devuelto al cliente es siempre genérico; el detalle real solo queda en los logs del servidor |
| `502` | Fallo al enviar un correo (dominio no permitido o error del proveedor SMTP) |

---

## Reglas de autorización por registro

Definidas en `app/infrastructure/security/permisos.py` (auditoría nov-2026). No crean roles nuevos: centralizan las listas que ya usaban los listados y el `PATCH`.

| Regla | Quién | Dónde se aplica |
| --- | --- | --- |
| Alta visibilidad | Rol Administrador, Supervisor, Responsable Finanzas; cargo Jefe de RRHH, Subgerente de Capital Humano, Jefe de Finanzas | Listados sin filtro; gestión de recepcionados ajenos |
| Gestión de solicitudes | Rol Administrador, Supervisor, Responsable Finanzas, Aprobador; cargo Jefe de Finanzas | `PATCH` y PDFs de cualquier solicitud |
| Creación sin restricción | Rol Administrador, Supervisor, Responsable Finanzas; cargo Jefe de Finanzas, Jefe de RRHH | Crear en cualquier obra, estado o a nombre de otro |
| Recepción | Rol Administrador, Supervisor, Responsable Finanzas; cargo Jefe de Finanzas | `POST /recepcionado` |
| Documentos del flujo | Gestión de solicitudes ∪ alta visibilidad | `/pdf-firmado/*`, `/pdf-registro-autorizacion/*` |
| Propiedad | `usuario_id` del registro, o nombre completo coincidente salvo homónimo con `usuario_id` propio | Todo lo anterior para usuarios sin rol de gestión |

Para el detalle de los mecanismos de seguridad detrás de estos códigos (rate limiting, 2FA, dispositivos de confianza), consulta [DOC_SPECIAL_FEATURES.md](DOC_SPECIAL_FEATURES.md).
