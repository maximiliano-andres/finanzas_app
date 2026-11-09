# Requerimientos del Servidor — FlujoPago

Este documento describe la infraestructura, configuración y pasos prioritarios para desplegar FlujoPago en producción para un volumen de **10 a 20 usuarios**. Está diseñado con un orden jerárquico para facilitar el aprovisionamiento y despliegue por parte del equipo de soporte técnico.

---

## Tabla de Contenido (Orden de Prioridades)

1. [Prioridad 1: Opciones de Nube y Costos Reales](#prioridad-1-opciones-de-nube-y-costos-reales)
2. [Prioridad 2: Dimensionamiento de Hardware y Memoria Swap](#prioridad-2-dimensionamiento-de-hardware-y-memoria-swap)
3. [Prioridad 3: Modelo de Despliegue y Software Base (Docker)](#prioridad-3-modelo-de-despliegue-y-software-base-docker)
4. [Prioridad 4: Arquitectura de Red, Puertos y TLS (HTTPS)](#prioridad-4-arquitectura-de-red-puertos-y-tls-https)
5. [Prioridad 5: Almacenamiento Persistente y Volúmenes de Datos](#prioridad-5-almacenamiento-persistente-y-volúmenes-de-datos)
6. [Prioridad 6: Configuración del Entorno (Variables .env)](#prioridad-6-configuración-del-entorno-variables-env)
7. [Prioridad 7: Checklist de Preparación del Servidor (Paso a Paso)](#prioridad-7-checklist-de-preparación-del-servidor-paso-a-paso)
8. [Consumo Real de Recursos y Almacenamiento](#consumo-real-de-recursos-y-almacenamiento)

---

## Prioridad 1: Opciones de Nube y Costos Reales

Para una escala de **10 a 20 usuarios**, la opción recomendada y más rentable es desplegar todo el stack del proyecto (`docker-compose.yml`) en un **servidor único VPS**.

A continuación se consolidan los costos reales estimados (actualizados al año 2026) y especificaciones técnicas recomendadas para cada proveedor de nube:

| Proveedor de Nube | Tipo de Instancia Recomendada | Recursos (vCPU / RAM) | Almacenamiento SSD Mínimo | Costo Estimado (On-Demand) | Costo Estimado (Reservado 1 Año) | Configuración Crítica del SO |
| --- | --- | --- | --- | --- | --- | --- |
| **GCP** (Google Cloud) | `e2-small` | 2 vCPUs / 2 GB RAM | 30 GB SSD Balanceado | **~$16.50 USD/mes** | **~$11.50 USD/mes** | Requiere activar **2 GB de Swap** |
| **AWS** (Amazon Web Services) | `t3a.small` o `t3.small` | 2 vCPUs / 2 GB RAM | 30 GB EBS gp3 | **~$16.10 - $17.50 USD/mes** | **~$10.90 - $11.60 USD/mes** | Requiere activar **2 GB de Swap** |
| **Azure** (Microsoft) | `Standard_B1ms` | 1 vCPU / 2 GB RAM | 32 GB SSD Estándar (E10) | **~$17.50 USD/mes** | **~$12.30 USD/mes** | Requiere activar **2 GB de Swap** |
| **Hetzner** *(Low-cost)* | `CX22` | 2 vCPUs / 4 GB RAM | 40 GB NVMe SSD | **~$5.50 USD/mes** (€5.00/mes) | N/A | **Altamente recomendado**. No requiere Swap. |
| **Contabo** *(Low-cost)* | `VPS S` | 4 vCPUs / 8 GB RAM | 50 GB NVMe SSD | **~$8.50 USD/mes** | N/A | Abundantes recursos para crecimiento. |
| **DigitalOcean** *(Low-cost)* | `Droplet Básico` | 2 vCPUs / 2 GB RAM | 60 GB SSD | **$18.00 USD/mes** | N/A | Requiere activar **2 GB de Swap** |

*Nota: Los costos de GCP, AWS y Azure include la suma de los servicios de cómputo y disco de almacenamiento.*

---

## Prioridad 2: Dimensionamiento de Hardware y Memoria Swap

### Tabla de Perfiles de Hardware

| Perfil | CPU | RAM | Disco | Escenario / Aplicabilidad |
| --- | --- | --- | --- | --- |
| **Micro (10-20 usuarios)** | 2 vCPU | 2 GB* | 25 GB SSD | **Producción de FlujoPago (Escala actual del proyecto)**. Requiere Swap de 2 GB. |
| **Mínimo General** | 2 vCPU | 4 GB | 20 GB SSD | Ambiente de pruebas o producción pequeña sin archivo de Swap. |
| **Recomendado** | 4 vCPU | 8 GB | 40 GB SSD | Producción media (decenas de usuarios concurrentes, alto flujo de PDFs). |

> [!IMPORTANT]
> **REQUERIMIENTO OBLIGATORIO DE SWAP (Para servidores de 2 GB de RAM)**:
> El stack completo de FlujoPago en Docker Compose consume cerca de **1.8 GB de RAM** sumando los límites asignados de los contenedores (`app` + `db` + `redis` + `db-backup`). 
> Si se despliega en un servidor de 2 GB de RAM física, **es mandatorio habilitar un archivo Swap (memoria de intercambio) de al menos 2 GB** en Linux para prevenir fallos OOM (Out Of Memory) y asegurar la estabilidad de la base de datos PostgreSQL durante picos de uso.

### Factores de Crecimiento de Disco
El almacenamiento necesario para producción a largo plazo depende de:
1.  **Documentos PDF**: Ubicados en `doc_pdf/`, `PDF_firmados/` y `PDF_autorizaciones/`. Los archivos se optimizan dinámicamente usando la librería `pikepdf`.
2.  **Respaldos de Base de Datos**: Respaldos locales `.sql.gz` generados en `backups/db/` con retención automática de hasta 12 meses.
3.  **Logs**: Rotación automática configurada en la app (máximo 5 archivos de 5 MB por proceso).

---

## Prioridad 3: Modelo de Despliegue y Software Base (Docker)

El proyecto FlujoPago está estructurado para ejecutarse **únicamente a través de contenedores Docker**. Esto simplifica el mantenimiento y evita dependencias directas en el sistema operativo host.

### Requisitos del Sistema Operativo Host
*   **Recomendado**: Linux (Ubuntu 22.04 LTS, Debian 12 o equivalente).
*   **Requisitos del Docker Host**: Docker Engine v24+ y Docker Compose v2 (plugin `docker compose`).
*   **Instalación Nativa (Sin Docker)**: **No recomendada para producción**. Aunque es compatible con Python 3.11 en Linux, el uso de compilaciones nativas dificulta el soporte técnico.

### Software Contenedorizado (Incluido en Docker Compose)
El soporte técnico no necesita instalar bases de datos ni runtimes de forma nativa en el host. Docker se encarga de aprovisionar:

| Servicio | Imagen Docker | Propósito / Notas |
| --- | --- | --- |
| **App (Backend)** | `Dockerfile` propio (Python 3.11-slim) | Lógica de la aplicación con FastAPI y Uvicorn. |
| **Base de Datos** | `postgres:16-alpine` | PostgreSQL 16 para persistencia relacional. |
| **Caché y MFA** | `redis:7-alpine` | Redis 7. Requerido para rate limiting y almacenamiento de códigos OTP de 2FA. |
| **Respaldos** | `prodrigestivill/postgres-backup-local:16-alpine` | Servicio de respaldos diarios automáticos y rotación de base de datos. |

---

## Prioridad 4: Arquitectura de Red, Puertos y TLS (HTTPS)

### Exposición de Puertos y Firewall
El firewall del host debe configurarse para proteger los servicios internos:

| Puerto | Servicio | Exposición Requerida | Notas |
| --- | --- | --- | --- |
| `8000` | FastAPI (Uvicorn) | **Interno / Proxy Inverso** | No debe exponerse directamente a Internet. Debe recibir solicitudes únicamente desde el proxy inverso local. |
| `5432` | PostgreSQL | **Solo Red de Docker** | No debe publicarse en el host. Solo accesible por la app dentro de la red interna de Docker (`flujopago-network`). |
| `6379` | Redis | **Solo Red de Docker** | Mapeado temporalmente en `docker-compose.yml` para desarrollo, pero en producción **debe bloquearse en el firewall o retirarse del mapeo de puertos** para evitar accesos no autorizados. |

### Cifrado TLS (HTTPS) y Proxy Inverso
*   La aplicación **no gestiona certificados SSL/TLS por sí misma**. 
*   **Es obligatorio** colocar un proxy inverso (Nginx, Caddy o un balanceador de carga de la nube) frente al puerto `8000`.
*   El proxy inverso debe encargarse de la terminación TLS, redirección de HTTP a HTTPS y reenvío de las cabeceras estándar (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`) para que el rate limiting y el cifrado de cookies de sesión funcionen correctamente.

---

## Prioridad 5: Almacenamiento Persistente y Volúmenes de Datos

Para evitar pérdida de información al reiniciar o actualizar los contenedores, se deben configurar los siguientes volúmenes y rutas en el disco del host:

| Ruta del Volumen / Carpeta | Tipo de Datos | Criticidad | Notas |
| --- | --- | --- | --- |
| `postgres_data` (Volumen Docker) | Datos de base de datos PostgreSQL | **Crítica** | Almacena toda la información transaccional y de usuarios. |
| `doc_pdf/` (Carpeta del host) | PDFs adjuntos originales | **Crítica** | Documentos adjuntos subidos por los usuarios. |
| `PDF_firmados/` (Carpeta del host) | PDFs firmados electrónicamente | **Crítica** | Documentación de solicitudes firmada. |
| `PDF_autorizaciones/` (Carpeta del host) | PDFs de autorizaciones y registros | **Crítica** | Comprobantes de transacciones autorizadas. |
| `backups/db/` (Carpeta del host) | Respaldos locales `.sql.gz` | **Alta** | Copias de seguridad de la base de datos. Se deben sincronizar con almacenamiento externo. |
| `redis_data` (Volumen Docker) | Sesiones y OTP temporales | Media | Su pérdida solo provoca la invalidación de OTPs activos y reseteo de rate limits. |

---

## Prioridad 6: Configuración del Entorno (Variables .env)

Todas las variables de entorno se leen desde el archivo `.env` en la raíz del proyecto. Las variables se clasifican por su prioridad de seguridad para producción:

### 1. Variables Críticas (Obligatorio Cambiar en Producción)
Estas variables **nunca** deben usar los valores por defecto del entorno de desarrollo.

*   `SECRET_KEY` / `JWT_SECRET`: Clave de firma para los tokens JWT (mínimo 32 caracteres aleatorios).
*   `FERNET_KEY`: Clave de cifrado simétrico Fernet para encriptar los secretos TOTP de 2FA en la base de datos (debe ser una clave base64 válida de 32 bytes).
*   `POSTGRES_PASSWORD` / `DB_PASS`: Contraseña robusta del usuario de PostgreSQL.
*   `REDIS_PASSWORD`: Contraseña robusta del servidor Redis.
*   `CORS_ALLOWED_ORIGINS`: Dominios reales del frontend autorizados para consumir la API (ej. `https://flujopago.empresa.cl`). No utilizar `*` en producción.
*   `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`: Credenciales del administrador inicial del sistema. Se crean únicamente durante la primera inicialización. Si falta la contraseña, se genera una aleatoria y se informa una vez en el log de arranque.
*   `EMAILS_PRUEBA_PERMITIDOS` (recomendado vacío en producción) y `LISTADO_MAX_REGISTROS` (tope de listados sin paginar, 10 000 por defecto): ver [DOC_ENV_CONFIGURATION.md](DOC_ENV_CONFIGURATION.md).

### 2. Variables de Conectividad y Red
*   `DATABASE_URL`: Cadena de conexión completa (`postgresql+asyncpg://...`). En Docker debe apuntar a `db:5432`.
*   `REDIS_URL`: Cadena de conexión a Redis (`redis://:password@redis:6379/0`).
*   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: Credenciales del servidor de correo saliente para envío de OTP y notificaciones.
*   `ALLOWED_EMAIL_DOMAINS`: Dominios a los cuales el sistema tiene permitido enviar correos (ej. `empresa.cl,gmail.com`).

### 3. Variables de Control de Seguridad y Rate Limits
*   `LOGIN_MAX_ATTEMPTS` (default: `5`): Intentos fallidos de login antes del bloqueo.
*   `LOGIN_LOCK_DURATION_SECONDS` (default: `900`): Duración del bloqueo en segundos (15 minutos).
*   `MFA_MAX_ATTEMPTS` (default: `5`): Intentos fallidos de ingreso de código 2FA antes del bloqueo.
*   `EMAIL_OTP_EXPIRE_SECONDS` (default: `300`): Validez del código de correo OTP (5 minutos).

---

## Prioridad 7: Checklist de Preparación del Servidor (Paso a Paso)

El equipo de soporte técnico debe validar cada uno de los siguientes puntos antes de poner la aplicación en marcha:

- [ ] **Aprovisionamiento**: Servidor creado según perfil Micro (2 vCPU, 2 GB RAM, 25 GB SSD).
- [ ] **Configuración de Swap**: Archivo de Swap de al menos 2 GB activo en el host (comando: `sudo swapon --show`).
- [ ] **Motor de Contenedores**: Docker Engine 24+ y Docker Compose v2 instalados y ejecutándose.
- [ ] **Seguridad de Red**: Firewall del host (UFW o similar) configurado para permitir solo tráfico en puertos `22` (SSH) y `80`/`443` (Proxy Inverso). El puerto `8000` debe ser inaccesible desde el exterior.
- [ ] **Proxy Inverso**: Nginx, Caddy o Balanceador de Nube configurado con certificados SSL (Let's Encrypt o corporativo) redirigiendo el tráfico seguro al puerto `8000`.
- [ ] **Persistencia**: Carpetas `doc_pdf/`, `PDF_firmados/`, `PDF_autorizaciones/` y `backups/db/` creadas en el host y mapeadas correctamente en `docker-compose.yml`.
- [ ] **Configuración de Entorno**: Archivo `.env` creado con contraseñas de producción seguras, claves criptográficas generadas de forma única (`SECRET_KEY` y `FERNET_KEY`) y configuración SMTP correcta.
- [ ] **CORS**: Orígenes CORS especificados de forma explícita sin comodines.
- [ ] **Respaldos Externos**: Script de respaldo (`scripts/backup_s3.sh` u otro método corporativo) configurado en el cron del host para sincronizar la base de datos y las carpetas de PDFs fuera del servidor principal.

---

## Consumo Real de Recursos y Almacenamiento

Para que el equipo de soporte técnico pueda monitorear y planificar el crecimiento del servidor, se presentan las métricas de consumo real medidas en producción y las proyecciones de almacenamiento.

### 1. Consumo Real de Recursos (RAM y CPU)
Aunque los límites de Docker en `docker-compose.yml` están configurados de forma segura con un total de ~1.78 GB de RAM reservada, el **consumo real en caliente** del stack es significativamente menor:

| Servicio Docker | Consumo RAM (Base / Inactivo) | Consumo RAM (Pico de Carga) | Consumo CPU (Base / Inactivo) | Consumo CPU (Pico de Carga) | Notas Técnicas |
| --- | --- | --- | --- | --- | --- |
| **`app`** (FastAPI) | ~80 MB - 100 MB | ~120 MB - 200 MB | < 0.1% | 15% - 30% (Spikes de 1-2s) | Aumenta temporalmente durante procesamiento de firmas y optimización de PDFs. |
| **`db`** (PostgreSQL) | ~25 MB - 40 MB | ~80 MB - 150 MB | < 0.5% | 5% - 10% | El consumo de RAM depende de las conexiones activas en el pool (máx. 15). |
| **`redis`** | ~10 MB - 15 MB | ~12 MB - 18 MB | < 0.1% | < 2% | Almacena datos volátiles (códigos de 2FA y bloqueos temporales). |
| **`db-backup`** | ~10 MB | ~30 MB | 0.0% | 5% - 10% | Solo consume CPU/RAM durante la ejecución del cron de respaldo diario (duración: ~3s). |
| **Total Estimado** | **~125 MB - 165 MB** | **~240 MB - 398 MB** | **< 1.0%** | **~25% - 50%** | **Se confirma que el perfil Micro (2 GB RAM) es plenamente viable y seguro con 2 GB Swap.** |

---

### 2. Estimación de Crecimiento de Almacenamiento en Disco
El espacio ocupado se compone de una base fija de instalación y un crecimiento dinámico según el volumen de solicitudes transaccionales (cada solicitud asume una base relacional y un promedio de 3 PDFs: original, firmado y comprobante de autorización):

*   **Espacio Base del Sistema**: **~10 GB** (Instalación de Ubuntu Server, Docker Engine, imágenes del proyecto descargadas y base de datos vacía).
*   **Base de Datos**: ~5 KB por solicitud (historial de auditoría, estados y metadatos).
*   **Documentos PDF (Comprimidos)**: ~150 KB por PDF promedio tras pasar por `pikepdf`. (Aprox. 450 KB totales en PDFs por cada solicitud).
*   **Respaldos Locales**: ~50 MB a 100 MB por backup diario (se almacenan 7 diarios, 4 semanales y 12 mensuales, total local: ~1 GB - 2 GB fijos autorotados).
*   **Logs**: Rotados y limitados a un máximo absoluto de 25 MB en total.

#### Proyección de Crecimiento de Disco según Uso

A continuación se detalla el espacio total en disco requerido según tres escenarios de uso para los 10-20 usuarios:

| Detalle / Escala de Uso | Escenario Bajo (50 Solicitudes/Mes) | Escenario Medio (500 Solicitudes/Mes) | Escenario Alto (2,000 Solicitudes/Mes) |
| --- | --- | --- | --- |
| **Crecimiento de BD (anual)** | ~3 MB / año | ~30 MB / año | ~120 MB / año |
| **Crecimiento de PDFs (anual)** | ~270 MB / año | ~2.7 GB / año | ~10.8 GB / año |
| **Crecimiento de Respaldos (anual)** | ~300 MB / año | ~1.2 GB / año | ~4.8 GB / año |
| **Tasa de Crecimiento Total** | **~0.6 GB / año** | **~3.9 GB / año** | **~15.7 GB / año** |
| **Espacio Requerido (Año 1)** | **~10.6 GB** | **~13.9 GB** | **~25.7 GB** |
| **Espacio Requerido (Año 3)** | **~11.8 GB** | **~21.7 GB** | **~57.1 GB** |
| **Recomendación de Disco SSD** | **25 GB SSD** (Dura >10 años) | **30 GB SSD** (Dura >5 años) | **60 GB SSD** (Dura >3 años) |
