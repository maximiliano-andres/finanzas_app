# Guía de Configuración del Archivo `.env` — FlujoPago

Este documento explica de forma sencilla y paso a paso cómo configurar el archivo `.env` del proyecto FlujoPago. Está diseñado para que cualquier persona, tenga o no conocimientos de programación, pueda preparar el sistema para producción o desarrollo de forma correcta y segura.

---

## ¿Qué es el archivo `.env` y por qué es importante?

El archivo `.env` (abreviatura de *environment* o entorno) actúa como el **panel de control de FlujoPago**. En él se guardan datos como las contraseñas de las bases de datos, las claves criptográficas para proteger las sesiones y la configuración para que el sistema pueda enviar correos electrónicos.

Por defecto, este archivo no existe al descargar el repositorio por motivos de seguridad. Para crearlo, debes copiar la plantilla de ejemplo:

1.  Abre una terminal en la carpeta del proyecto.
2.  Ejecuta el siguiente comando para crear una copia limpia:
    ```bash
    cp .env.example .env
    ```
3.  Abre el nuevo archivo `.env` con cualquier editor de texto (Bloc de Notas, VS Code, Nano, etc.) para comenzar a modificarlo.

---

## 🗝️ Paso Crítico 1: Generar las Llaves de Seguridad

FlujoPago requiere dos llaves secretas criptográficas en el archivo `.env` para asegurar el sistema. **Bajo ninguna circunstancia utilices los valores por defecto en producción.**

### 1. `SECRET_KEY` (Firma de Sesión / JWT)
Se usa para cifrar las cookies del navegador e impedir que los usuarios falsifiquen su identidad. Debe ser una cadena de texto larga y aleatoria.

*   **Opción para Técnicos (Terminal)**: ejecuta el comando:
    ```bash
    python -c "import secrets; print(secrets.token_urlsafe(32))"
    ```
*   **Opción para No Técnicos**: ingresa a una web segura como [1Password Strong Password Generator](https://1password.com/password-generator/) o similar, genera una contraseña aleatoria de 64 caracteres con letras y números, y pégala en esta variable.

### 2. `FERNET_KEY` (Cifrado de 2FA)
Se usa para cifrar los códigos secretos de la verificación de dos factores (2FA/MFA) en la base de datos. Si se pierde o se cambia después de que el sistema esté operando, **todos los usuarios perderán el acceso a su 2FA** y deberán ser restablecidos manualmente.

*   **Opción para Técnicos (Terminal)**: ejecuta el comando:
    ```bash
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ```
*   **Opción para No Técnicos**: debe ser una clave en formato Base64 válida de 32 bytes. Si no tienes acceso a una terminal, puedes generar una cadena Base64 compatible en herramientas web de codificación segura de 32 bytes de longitud.

---

## 📝 Desglose de Variables por Módulo

### 1. Base de Datos (PostgreSQL)
Define dónde y cómo se almacenan todos los registros financieros y de usuarios.

*   `DB_USER`: Nombre del usuario de la base de datos (por defecto: `app_user`).
*   `DB_PASS`: Contraseña de acceso a la base de datos.
*   `DB_HOST`: Dirección del servidor de la base de datos (ver casos prácticos abajo).
*   `DB_PORT`: Puerto de conexión (estándar: `5432`).
*   `DB_NAME`: Nombre de la base de datos del proyecto (por defecto: `empresa_db`).
*   `POSTGRES_PASSWORD`: **Debe ser exactamente igual a `DB_PASS`**. Es la clave que el contenedor oficial de PostgreSQL leerá al iniciarse por primera vez para crear la seguridad de la base de datos.
*   `DATABASE_URL`: Cadena de conexión completa que usa el código. Formato: `postgresql+asyncpg://USUARIO:CONTRASEÑA@HOST:PUERTO/NOMBRE_BD`.

---

### 2. Caché y Bloqueos de Seguridad (Redis)
Redis se encarga de guardar temporalmente los códigos de verificación de correo y de aplicar los bloqueos de seguridad por intentos fallidos.

*   `REDIS_PASSWORD`: Contraseña para proteger el acceso a Redis.
*   `REDIS_URL`: Dirección de conexión de Redis. Formato: `redis://:CONTRASEÑA@HOST:6379/0`.

---

### 3. Servidor de Correo (SMTP)
Requerido para que el sistema envíe los correos de restablecimiento de contraseña, códigos OTP y configuraciones iniciales de 2FA.

*   `SMTP_HOST`: Dirección del servidor SMTP de tu proveedor (ej. `smtp.gmail.com`).
*   `SMTP_PORT`: Puerto utilizado. Usar `587` si tu proveedor utiliza TLS (recomendado) o `465` para SSL.
*   `SMTP_USER`: Cuenta de correo emisora (ej. `no-reply@miempresa.cl`).
*   `SMTP_PASSWORD`: Contraseña de la cuenta o contraseña de aplicación (ver casos prácticos).
*   `SMTP_FROM`: El nombre de correo electrónico que verá el destinatario. Debe coincidir con `SMTP_USER` o estar autorizado por tu proveedor.
*   `ALLOWED_EMAIL_DOMAINS`: Filtro de seguridad obligatorio. Lista de dominios (separados por comas) a los que la aplicación tiene permitido enviar correos (ej. `miempresa.cl,gmail.com`).

---

### 4. Parámetros de Bloqueo y Seguridad (Rate Limiting)
Valores numéricos que regulan el comportamiento defensivo de la aplicación. Los valores por defecto de la plantilla son adecuados para producción:

*   `LOGIN_MAX_ATTEMPTS` (`5`): Número máximo de intentos fallidos antes de bloquear al usuario.
*   `LOGIN_LOCK_DURATION_SECONDS` (`900`): Tiempo que dura el bloqueo tras fallar el login (900 segundos = 15 minutos).
*   `MFA_MAX_ATTEMPTS` (`5`): Intentos fallidos ingresando el código 2FA antes del bloqueo temporal.
*   `EMAIL_OTP_EXPIRE_SECONDS` (`300`): Tiempo de validez del código de correo OTP (5 minutos).

---

### 5. Control de Acceso Web (CORS)
*   `CORS_ALLOWED_ORIGINS`: Lista separada por comas de las URLs exactas desde donde se cargará el frontend o la app web (ej. `http://localhost:8000,https://flujopago.miempresa.cl`). **No uses comodines (`*`) en producción**, ya que compromete la seguridad de las cookies de sesión.

---

### 6. Administrador Inicial (Seed Data)
Estas variables se leen **únicamente la primera vez** que arranca la base de datos para crear el usuario maestro.

*   `SEED_SUPER_ADMIN_EMAIL`: Correo electrónico del usuario administrador maestro (ej. `admin@miempresa.cl`).
*   `SEED_SUPER_ADMIN_PASSWORD`: Contraseña del administrador maestro. **Debe cumplir obligatoriamente las siguientes reglas**:
    *   Mínimo 8 caracteres de longitud.
    *   Al menos 1 mayúscula y 1 minúscula.
    *   Al menos 1 número.
    *   Al menos 1 carácter especial (ej. `@`, `#`, `!`).
    *   Si se omite, la primera instalación genera una contraseña aleatoria y la informa **una sola vez** en el log de arranque. El código ya no contiene una contraseña por defecto (auditoría nov-2026, H-32).
*   `EMAILS_PRUEBA_PERMITIDOS` *(opcional)*: emails ajenos a `@flujopago.cl`/`@grupodemo.cl` aceptados en login y alta de usuarios, separados por coma. Sin la variable se conserva la lista histórica del código; **en producción se recomienda `EMAILS_PRUEBA_PERMITIDOS=`** (vacía). El email de `SEED_SUPER_ADMIN_EMAIL` siempre queda permitido y los `@pushhr.cl` siguen aceptados.

> **Cuenta de prueba eliminada.** Versiones anteriores sembraban un usuario Administrador `casa2301teo@gmail.com` con contraseña publicada en el código. Ya no se crea, y en cada arranque `desactivar_credenciales_de_prueba()` lo deja inutilizable si aún conserva esa contraseña (no se borra ni cambia su rol). Si se necesita, restablezca su contraseña desde Administración.

---

### 7. Listados
*   `LISTADO_MAX_REGISTROS` *(opcional, por defecto `10000`)*: tope de seguridad para los listados pedidos **sin** `limit`/`offset` (es como los consume el frontend). Si se alcanza, se registra una advertencia en el log. Antes existía un tope fijo y silencioso de 200 registros que hacía desaparecer filas de las bandejas.

---

## 🛠️ Casos Prácticos de Configuración

Dependiendo de cómo decidas desplegar el proyecto, copia y adapta los valores específicos para cada caso:

### Caso A: Despliegue en Servidor Único usando Docker Compose (Recomendado)
Cuando ejecutas `docker-compose up`, Docker crea una red interna donde los servicios se comunican usando sus propios nombres de contenedor (`db` y `redis`).

**Configura tu `.env` con estos hosts específicos:**
```env
# Conexión interna de Docker
DB_HOST=db
REDIS_URL=redis://:mi_clave_redis_123@redis:6379/0

# Base de datos
DB_USER=app_user
DB_PASS=clave_segura_db_987
DB_NAME=empresa_db
POSTGRES_PASSWORD=clave_segura_db_987

# URL completa usando el host 'db' de Docker
DATABASE_URL=postgresql+asyncpg://app_user:clave_segura_db_987@db:5432/empresa_db

# Contraseña de Redis
REDIS_PASSWORD=mi_clave_redis_123
```

---

### Caso B: Ejecución Local Nativa (Desarrollo sin Docker)
Si ejecutas el backend de forma nativa corriendo `uvicorn app.main:app` y tienes PostgreSQL y Redis instalados directamente en tu computadora.

**Configura tu `.env` apuntando al host local (`127.0.0.1`):**
```env
DB_HOST=127.0.0.1
REDIS_URL=redis://:clave_redis_local@127.0.0.1:6379/0

DB_USER=postgres
DB_PASS=mi_clave_local_postgres
DB_NAME=flujopago_db

DATABASE_URL=postgresql+asyncpg://postgres:mi_clave_local_postgres@127.0.0.1:5432/flujopago_db

REDIS_PASSWORD=clave_redis_local
```

---

### Caso C: Base de Datos Externa Gestionada (e.g. AWS RDS o GCP Cloud SQL)
Si por políticas de infraestructura la base de datos PostgreSQL y Redis corren en servicios gestionados independientes del servidor de la aplicación.

1.  Averigua la dirección endpoint (URL o IP) provista por tu nube.
2.  Configura tu `.env` de la siguiente forma:
```env
# Dirección endpoint provista por AWS/GCP
DB_HOST=flujopago-production-db.crw372is9.us-east-1.rds.amazonaws.com
DB_PORT=5432

DB_USER=admin_corporativo
DB_PASS=ClaveComplejaCloud2026!
DB_NAME=flujopago_prod

# Importante: Utiliza el puerto y host externos en la URL
DATABASE_URL=postgresql+asyncpg://admin_corporativo:ClaveComplejaCloud2026!@flujopago-production-db.crw372is9.us-east-1.rds.amazonaws.com:5432/flujopago_prod

# Redis externo
REDIS_URL=redis://:clave_redis_cloud@flujopago-redis.cache.amazonaws.com:6379/0
REDIS_PASSWORD=clave_redis_cloud
```
*Nota: Si usas una base de datos externa, puedes editar el archivo `docker-compose.yml` para comentar o eliminar la sección del servicio `db` y `redis`, dejando que Docker Compose administre únicamente el contenedor de la aplicación `app`.*

---

### Caso D: Configuración usando Gmail como Servidor de Correo
Si deseas utilizar una cuenta de Gmail de la empresa para el envío de notificaciones y códigos OTP de 2FA.

1.  Entra a la configuración de la cuenta de Google.
2.  Activa la **Verificación en dos pasos** (requisito obligatorio de seguridad).
3.  Busca **Contraseñas de aplicaciones** y genera una clave de 16 caracteres específica para FlujoPago (Google te mostrará un código en pantalla).
4.  Configura tu `.env` de esta forma:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notificaciones.empresa@gmail.com
# Pega aquí el código de 16 caracteres sin espacios
SMTP_PASSWORD=abcd efgh ijkl mnop
SMTP_FROM=notificaciones.empresa@gmail.com
ALLOWED_EMAIL_DOMAINS=miempresa.cl,gmail.com
```

---

### Caso E: Configuración usando un Servidor SMTP Corporativo
Si tu empresa cuenta con un servidor de correo interno o un proveedor masivo como Amazon SES, SendGrid o Mailtrap (para pruebas).

**Ejemplo para servidor corporativo estándar:**
```env
SMTP_HOST=mail.miempresa.cl
SMTP_PORT=587
SMTP_USER=no-reply@miempresa.cl
SMTP_PASSWORD=ContraseñaSMTPCorporativa2026
SMTP_FROM=Sistema FlujoPago <no-reply@miempresa.cl>
ALLOWED_EMAIL_DOMAINS=miempresa.cl,gmail.com,outlook.com
```

---

## ✅ Lista de Chequeo Final (Evita Errores Comunes)

Antes de iniciar la aplicación por primera vez en producción, realiza este repaso rápido:

- [ ] ¿Cambiaste las claves por defecto de `SECRET_KEY` y `FERNET_KEY` por claves generadas de forma aleatoria?
- [ ] ¿Coincide exactamente la contraseña `DB_PASS` con `POSTGRES_PASSWORD`?
- [ ] ¿Coincide la contraseña colocada en `REDIS_PASSWORD` con la contraseña inyectada en la dirección `REDIS_URL`?
- [ ] Si estás usando Docker, ¿verificaste que `DB_HOST` esté configurado como `db` y no como `127.0.0.1`?
- [ ] ¿Tu contraseña de administrador inicial (`SEED_SUPER_ADMIN_PASSWORD`) contiene al menos una mayúscula, un número y un símbolo especial?
- [ ] ¿Definiste `EMAILS_PRUEBA_PERMITIDOS=` (vacía o con las cuentas estrictamente necesarias) en producción?
- [ ] ¿Revisaste en el log del primer arranque si se generó la contraseña del super administrador?
- [ ] En `CORS_ALLOWED_ORIGINS`, ¿especificaste el dominio de producción del frontend sin colocar un comodín `*`?
