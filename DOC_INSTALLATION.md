# Guía de Instalación — FlujoPago

Esta guía cubre la instalación y puesta en marcha de **FlujoPago** en dos escenarios: despliegue con **Docker Compose** (recomendado para producción y para un entorno de desarrollo consistente) y ejecución **local sin contenedores** (para desarrollo puntual).

Para el detalle de hardware, sistema operativo y variables de entorno, consulta [DOC_SERVER_REQUIREMENTS.md](DOC_SERVER_REQUIREMENTS.md).

---

## Tabla de Contenido

- [Requisitos Previos](#requisitos-previos)
- [Opción A — Instalación con Docker Compose (recomendada)](#opción-a--instalación-con-docker-compose-recomendada)
- [Opción B — Instalación Local sin Docker](#opción-b--instalación-local-sin-docker)
- [Configuración de Variables de Entorno](#configuración-de-variables-de-entorno)
- [Configuración del Servicio de Correo (SMTP)](#configuración-del-servicio-de-correo-smtp)
- [Primer Inicio y Datos Semilla](#primer-inicio-y-datos-semilla)
- [Verificación de la Instalación](#verificación-de-la-instalación)
- [Configuración de Respaldos](#configuración-de-respaldos)
- [Actualización de una Instalación Existente](#actualización-de-una-instalación-existente)
- [Solución de Problemas](#solución-de-problemas)

---

## Requisitos Previos

| Herramienta | Versión mínima | Necesaria para |
| --- | --- | --- |
| Docker + Docker Compose | 24+ / v2 | Opción A (recomendada) |
| Python | 3.11 | Opción B |
| PostgreSQL | 16 | Ambas opciones (contenedor o servidor propio) |
| Redis | 7 | Ambas opciones — requerido para 2FA y rate limiting |
| Git | cualquiera | Clonar el repositorio |
| Cuenta SMTP | — | Envío de OTP, activación 2FA y contraseñas temporales (Gmail, Mailtrap, SES, etc.) |

---

## Opción A — Instalación con Docker Compose (recomendada)

Docker Compose levanta automáticamente la aplicación, PostgreSQL, Redis y el servicio de respaldo diario en una sola red aislada.

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd FlujoPago
```

### 2. Crear el archivo de variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y completa como mínimo:

- `SECRET_KEY` y `FERNET_KEY` (ver sección de [generación de claves](#configuración-de-variables-de-entorno))
- Credenciales de PostgreSQL (`DB_USER`, `DB_PASS`, `DB_NAME`) — deben coincidir con `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- Datos SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`)
- `CORS_ALLOWED_ORIGINS` con el dominio real donde se publicará la aplicación

### 3. Construir y levantar los servicios

```bash
docker-compose up -d --build
```

Esto levanta 4 contenedores: `flujopago-app`, `flujopago-postgres`, `flujopago-redis` y `flujopago-db-backup`. La aplicación espera a que PostgreSQL reporte estado `healthy` antes de arrancar (`depends_on: condition: service_healthy`).

### 4. Verificar que todo esté en ejecución

```bash
docker-compose ps
docker-compose logs -f app
```

Al iniciar, la aplicación crea automáticamente las tablas, aplica migraciones idempotentes y siembra los datos maestros (empresas, roles, procesos, usuario administrador). Deberías ver en los logs:

```
Aplicación iniciando
Aplicación iniciada exitosamente
```

### 5. Acceder a la aplicación

- Interfaz: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`

Inicia sesión con las credenciales por defecto (ver [Primer Inicio](#primer-inicio-y-datos-semilla)) y cámbialas inmediatamente.

---

## Opción B — Instalación Local sin Docker

Recomendada solo para desarrollo puntual en una máquina que ya cuenta con PostgreSQL y Redis accesibles (locales o remotos).

### 1. Clonar el repositorio y crear el entorno virtual

```bash
git clone <url-del-repositorio>
cd FlujoPago

python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 2. Instalar dependencias de sistema (compilación de extensiones nativas)

Algunas dependencias de Python (`psycopg`, `cryptography`, `argon2-cffi`, `pikepdf`) requieren librerías nativas para compilarse.

**Debian/Ubuntu:**

```bash
sudo apt-get update
sudo apt-get install -y build-essential gcc libpq-dev libffi-dev libqpdf-dev pkg-config \
    python3.11-dev python3.11-venv
```

**RHEL/CentOS/Fedora:**

```bash
sudo dnf install -y gcc gcc-c++ make postgresql-devel libffi-devel qpdf-devel pkgconfig python3.11-devel
```

**macOS (Homebrew):**

```bash
brew install postgresql qpdf libffi pkg-config
```

### 3. Instalar dependencias de Python

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Preparar PostgreSQL y Redis

Si no usas Docker para estos servicios, instala y arranca PostgreSQL 16 y Redis 7 localmente, y crea la base de datos:

```sql
CREATE DATABASE "flujopago_db";
```

### 5. Configurar el archivo `.env`

```bash
cp .env.example .env
```

Ajusta `DB_HOST`, `DB_PORT`, `REDIS_URL` y el resto de variables para que apunten a tus instancias locales (ver [Configuración de Variables de Entorno](#configuración-de-variables-de-entorno)).

### 6. Ejecutar la aplicación

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

La aplicación crea las tablas y siembra los datos maestros automáticamente en el primer arranque (evento `lifespan` de FastAPI, sin necesidad de comandos de migración manuales).

---

## Configuración de Variables de Entorno

Copia `.env.example` a `.env` y complétalo. El detalle de cada variable, su propósito y su valor por defecto en el código está en [DOC_SERVER_REQUIREMENTS.md](DOC_SERVER_REQUIREMENTS.md#variables-de-entorno). Las claves de seguridad se generan así:

```bash
# SECRET_KEY — firma de los tokens JWT (mínimo 32 caracteres aleatorios)
python -c "import secrets; print(secrets.token_urlsafe(32))"

# FERNET_KEY — cifrado simétrico de los secretos TOTP en base de datos
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

> **Importante:** `FERNET_KEY` debe generarse **una sola vez** y conservarse estable. Si se regenera después de que existan usuarios con 2FA activo, todos sus secretos TOTP cifrados en base de datos quedan irrecuperables y deberán reconfigurar su 2FA desde cero.

No es necesario reiniciar servicios adicionales tras cambiar `.env` en Docker: `docker-compose up -d` vuelve a inyectar las variables al recrear el contenedor `app`.

---

## Configuración del Servicio de Correo (SMTP)

FlujoPago depende de un servidor SMTP para: el correo de activación de 2FA (con QR y backup codes), el envío de códigos OTP alternativos al 2FA, y el envío de contraseñas temporales generadas por un administrador.

### Usando Gmail

1. Activa la verificación en dos pasos en la cuenta de Google que se usará para enviar correo.
2. Genera una **Contraseña de Aplicación** (Cuenta de Google → Seguridad → Contraseñas de aplicaciones).
3. Configura en `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_cuenta@gmail.com
SMTP_PASSWORD=<contraseña-de-aplicación-de-16-caracteres>
SMTP_FROM=tu_cuenta@gmail.com
```

### Usando otro proveedor (Mailtrap, Amazon SES, SendGrid, etc.)

Ajusta `SMTP_HOST`/`SMTP_PORT` según el proveedor. El servicio detecta automáticamente si usar `STARTTLS` (puertos `587`/`2525`) o TLS directo (puerto `465`).

### Whitelist de dominios de destino

`ALLOWED_EMAIL_DOMAINS` restringe a qué dominios de correo el sistema **enviará** mensajes (independiente del dominio permitido para iniciar sesión). Cualquier intento de enviar un correo a un dominio no incluido en esta lista se descarta silenciosamente (se registra en el log, pero no se lanza un error al usuario). Agrega aquí todos los dominios corporativos y de pruebas que deban recibir correos del sistema:

```env
ALLOWED_EMAIL_DOMAINS=flujopago.cl,grupodemo.cl,gmail.com,hotmail.com,pushhr.cl
```

---

## Primer Inicio y Datos Semilla

En el primer arranque (Docker o local), el sistema crea automáticamente:

- Las tablas del modelo de datos y las migraciones incrementales de columnas MFA, incluida la tabla de control `db_initialization_log`
- 9 procesos financieros, 3 empresas de ejemplo (ANDES, CORDILLERA, PACIFICO), 4 roles y el catálogo de obras/procesos auxiliares
- Un **usuario Super Administrador** por defecto, con las credenciales que definas en `.env`:

  ```
  Email:      SEED_SUPER_ADMIN_EMAIL       (por defecto: super_admin@flujopago.cl)
  Contraseña: SEED_SUPER_ADMIN_PASSWORD    (sin valor por defecto: si se omite, se genera una
                                            aleatoria y se muestra UNA vez en el log de arranque)
  ```

  > **Cambia estos valores de ejemplo en tu `.env` antes de desplegar en producción.** Esta cuenta está exceptuada del cambio forzado de contraseña en el primer login (`must_change_password` se ignora para ella), aunque sigue debiendo configurar su 2FA normalmente.

> **Ya no se crea ningún usuario de prueba.** Versiones anteriores sembraban `casa2301teo@gmail.com` (rol Administrador) con contraseña publicada en el código. Desde la auditoría de nov-2026, en **cada arranque** `desactivar_credenciales_de_prueba()` revisa las instalaciones existentes y, si esa cuenta conserva la contraseña publicada, le asigna una aleatoria, exige cambio de contraseña, desactiva su 2FA y revoca sus dispositivos (no se borra ni cambia su rol). Verás en el log: `[SEGURIDAD] Cuenta de prueba ... deshabilitada`.

### Idempotencia del seed

`db_seed.py` solo siembra datos en la **primera instalación real**. Antes de insertar nada, verifica la tabla de control `db_initialization_log`:

- Si ya existe la clave `db_seed_executed`, el seed se omite por completo (no se reinserta nada en reinicios posteriores).
- Si el log de control está vacío pero las tablas `roles`/`usuarios` ya contienen datos (por ejemplo, al actualizar una instalación existente que no tenía esta tabla), se registra la inicialización de forma retroactiva y se omite el seed, evitando duplicar datos maestros o usuarios.

Esto significa que **cambiar `SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD` en el `.env` después del primer arranque no tiene efecto** sobre una base de datos ya inicializada — el usuario Super Administrador ya existente debe actualizarse manualmente o desde el panel de administración.

### Pasos recomendados tras el primer inicio

1. Inicia sesión con el usuario Super Administrador (el cambio forzado de contraseña no aplica a esta cuenta, pero se recomienda cambiar la contraseña manualmente desde el panel si se usó un valor de ejemplo).
2. Configura tu propio 2FA (`/mfa-verify` → escanear QR o usar OTP por correo) — sigue siendo obligatorio para el Super Administrador.
3. Crea los usuarios reales de la organización desde el panel de administración (`POST /usuarios`), asignando rol, cargo, empresa y obras.
4. Define `EMAILS_PRUEBA_PERMITIDOS=` (vacía) en el `.env` de producción para no aceptar correos de prueba fuera de los dominios corporativos (ver [DOC_ENV_CONFIGURATION.md](DOC_ENV_CONFIGURATION.md)).
5. Verifica que `CORS_ALLOWED_ORIGINS` y `SECRET_KEY` estén correctamente configurados para el dominio de producción.

---

## Verificación de la Instalación

```bash
# La aplicación responde
curl -i http://localhost:8000/

# Documentación interactiva accesible
curl -I http://localhost:8000/docs

# Estado de los contenedores (si se usó Docker)
docker-compose ps

# Salud de PostgreSQL
docker-compose exec db pg_isready -U postgres -d flujopago_db

# Salud de Redis
docker-compose exec redis redis-cli -a $REDIS_PASSWORD ping
```

Ejecuta también la suite de tests para confirmar que el código y las dependencias están correctamente instalados. El script levanta PostgreSQL y Redis **efímeros y aislados** en Docker (no toca la base de datos real):

```bash
scripts/run_backend_tests.sh               # unitarias (app/tests) + integración real (tests/integration)
scripts/run_backend_tests.sh unit          # solo unitarias
scripts/run_backend_tests.sh integration   # solo integración
```

Sin Docker, las pruebas unitarias se pueden ejecutar localmente; **`pytest-asyncio` es obligatorio** (sin él, 44 tests async se omiten en silencio):

```bash
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest app/tests -q
```

---

## Configuración de Respaldos

El servicio `db-backup` de `docker-compose.yml` respalda PostgreSQL automáticamente sin configuración adicional. Para habilitar el respaldo completo a AWS S3 (base de datos + adjuntos PDF), sigue las instrucciones dentro de `scripts/backup_s3.sh` y descomenta la sección de subida a S3 una vez configuradas las credenciales de AWS. Ver el detalle completo en [SPECIAL_FEATURES.md](SPECIAL_FEATURES.md#respaldos-y-continuidad) y en el propio [README](README.md#-respaldos-y-continuidad).

---

## Actualización de una Instalación Existente

```bash
git pull origin main

# Docker
docker-compose up -d --build

# Local
pip install -r requirements.txt --upgrade
```

Las migraciones de esquema (`app/infrastructure/db/database.py`) son idempotentes (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) y se ejecutan automáticamente en cada arranque — no requieren un paso de migración manual (el proyecto no usa Alembic).

---

## Solución de Problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| La app no arranca, error de conexión a PostgreSQL | `db` aún no está listo o credenciales incorrectas | Verifica `docker-compose logs db` y que `DATABASE_URL` coincida con `POSTGRES_PASSWORD` |
| Los usuarios pierden su 2FA tras un despliegue | `FERNET_KEY` cambió entre despliegues | Restaura la `FERNET_KEY` original o pide a los usuarios reconfigurar su 2FA |
| No llegan los correos de OTP / activación | Dominio del destinatario fuera de `ALLOWED_EMAIL_DOMAINS`, o credenciales SMTP incorrectas | Revisa los logs de la app (`logger` de `email_service`) y agrega el dominio faltante |
| `401` inesperado en cada request | `SECRET_KEY` no configurada (usando el valor de desarrollo) o cookies bloqueadas por el navegador | Define `SECRET_KEY` en `.env` y verifica configuración de `SameSite`/HTTPS |
| Peticiones desde el frontend bloqueadas por CORS | `CORS_ALLOWED_ORIGINS` no incluye el dominio real | Agrega el origen exacto (protocolo + dominio) a la variable |
| El contenedor `app` no ve cambios de código | Volumen bind montado pero sin `--reload`, o imagen no reconstruida | Usa `docker-compose up -d --build` tras cambios en dependencias |

Para detalles adicionales sobre requerimientos de infraestructura, revisa [DOC_SERVER_REQUIREMENTS.md](DOC_SERVER_REQUIREMENTS.md).
