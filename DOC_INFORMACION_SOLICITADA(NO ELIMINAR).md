# FlujoPago — Información Técnica Solicitada

**Sistema:** FlujoPago — Gestión de Pagos y Flujos de Autorización
**Fecha:** Julio 2026
**Documento preparado para:** Cliente
**Alcance:** Este documento responde a las consultas sobre arquitectura, desarrollo, seguridad de accesos, protección de datos y continuidad operativa del sistema FlujoPago, en base al estado actual del proyecto.

---

## Arquitectura y Desarrollo

### 1. Tecnologías utilizadas (Frontend y Backend)

**Backend:**
- **Lenguaje:** Python 3.11
- **Framework:** FastAPI (framework moderno de alto rendimiento, basado en estándares async/ASGI)
- **Servidor de aplicación:** Uvicorn
- **Base de datos:** PostgreSQL 16, administrada mediante SQLAlchemy 2.0 (ORM), con drivers de conexión de alto rendimiento (psycopg3 / asyncpg)
- **Caché y control de sesiones temporales:** Redis 7
- **Validación de datos de entrada:** Pydantic v2
- **Contenerización y despliegue:** Docker y Docker Compose

**Frontend:**
- HTML generado desde el servidor mediante el motor de plantillas Jinja2
- JavaScript nativo (sin dependencia de frameworks como React, Vue o Angular)
- Tailwind CSS para la capa visual, junto con Font Awesome para iconografía

Esta combinación de tecnologías corresponde a un stack moderno, ampliamente utilizado en la industria, con soporte a largo plazo y una comunidad activa de desarrollo.

### 2. ¿Usa CMS o Framework?

FlujoPago **no utiliza ningún CMS** (no está construido sobre WordPress, Joomla ni gestores similares). Tampoco se apoya en frameworks de frontend tipo React/Vue/Angular ni en frameworks PHP tipo Laravel.

El sistema está construido íntegramente sobre **FastAPI** (framework de backend en Python), con una interfaz web renderizada por el propio servidor. Esta decisión de arquitectura fue deliberada: al tratarse de un sistema interno de gestión de pagos con reglas de negocio específicas (flujos de aprobación multinivel, roles diferenciados, trazabilidad de solicitudes), un desarrollo a medida sobre un framework de bajo nivel ofrece mayor control, rendimiento y seguridad que adaptar un CMS genérico a un caso de uso que no fue diseñado para ese propósito.

### 3. Código propio y documentación

El **100% del código de negocio (backend y frontend) es desarrollo propio a medida**. No se utilizan plantillas comerciales, temas de terceros ni módulos "low-code" preconstruidos. Las únicas dependencias externas corresponden a librerías de código abierto estándar de la industria (FastAPI, SQLAlchemy, Tailwind CSS, etc.), todas de uso público, ampliamente auditadas y con actualizaciones activas.

El proyecto sigue una **arquitectura por capas** (dominio de negocio, infraestructura técnica e interfaces/API), lo que separa claramente las reglas de negocio de los detalles técnicos (base de datos, correo, seguridad) y facilita que un equipo de desarrollo distinto al actual pueda comprender y dar mantenimiento al sistema.

Documentación entregada junto con el proyecto:
- **README técnico**, con arquitectura general, flujo de autenticación, modelo de datos, variables de entorno y guía de despliegue.
- **Informes específicos de seguridad**, incluyendo el tratamiento de documentos PDF y la política de generación de credenciales.
- **Comentarios y organización del código por dominio de negocio** (solicitudes, aprobaciones, finanzas, seguridad, administración), lo que reduce la curva de aprendizaje para un nuevo desarrollador.

Recomendamos mantener esta documentación bajo control de versiones junto con el código y actualizarla en cada cambio relevante de arquitectura, de forma que continúe siendo un reflejo fiel del sistema en producción.

---

## Acceso y Seguridad de Usuarios

### 4. Validación de credenciales y protección contra accesos no autorizados

El acceso a FlujoPago está protegido por múltiples capas de seguridad:

- **Contraseñas:** se almacenan exclusivamente como *hash* mediante **Argon2id**, el algoritmo ganador de la Password Hashing Competition y actualmente considerado el estándar más robusto de la industria (superior a alternativas más antiguas como MD5, SHA o incluso bcrypt en resistencia a ataques por fuerza bruta con hardware especializado). En ningún caso se guarda o transmite la contraseña en texto plano.
- **Política de contraseñas fuertes:** se exige un mínimo de 8 caracteres, al menos una letra mayúscula, al menos un número y al menos un símbolo especial, validado tanto en el formulario como en el servidor.
- **Autenticación de doble factor (2FA):** implementada mediante el estándar TOTP (compatible con Google Authenticator, Authy y aplicaciones equivalentes). El secreto de cada usuario se guarda cifrado en la base de datos (cifrado simétrico AES vía Fernet), nunca en texto plano. Adicionalmente:
  - Se generan **10 códigos de recuperación** de un solo uso para casos de pérdida del dispositivo.
  - Existe la opción de marcar un **dispositivo de confianza** (vigente 30 días), que se revoca automáticamente si el usuario cambia su contraseña o desactiva el 2FA.
  - También está disponible el envío de un código de verificación alternativo por correo electrónico.
- **Bloqueo por intentos fallidos:** tanto el inicio de sesión (correo y contraseña) como la verificación del segundo factor (2FA) bloquean automáticamente el acceso tras **5 intentos fallidos**, durante **15 minutos**, controlado por usuario e IP de origen. Al iniciar sesión correctamente, el contador de intentos se reinicia. Esta misma lógica de límite de frecuencia se aplica al envío de códigos por correo, para evitar abuso del canal.
- **Sesión:** una vez autenticado, el sistema emite un token de sesión firmado digitalmente (JWT), almacenado en una cookie protegida contra acceso por scripts (*HttpOnly*), con una vigencia de 24 horas.

### 5. Roles y permisos

El sistema contempla los siguientes roles: **Administrador, Solicitante, Aprobador y Responsable de Finanzas.** Cada solicitud de pago transita por un flujo de estados controlado (creación → aprobación nivel 1 → aprobación nivel 2/Finanzas → pago), y la información que cada usuario visualiza se filtra automáticamente según su rol y su cargo dentro de la organización — por ejemplo, un usuario con rol "Solicitante" únicamente ve sus propias solicitudes, mientras que un "Aprobador" ve solo aquellas pendientes de su nivel de revisión.

Puntos clave respecto al acceso a configuraciones sensibles:

- **La base de datos nunca es accesible desde el navegador ni desde el frontend.** Todo acceso a los datos pasa exclusivamente por el backend (FastAPI), que es el único componente con credenciales de conexión a PostgreSQL. No existe ninguna vía por la cual un usuario final —independiente de su rol— pueda ejecutar consultas directas contra la base de datos.
- **Toda funcionalidad administrativa requiere sesión autenticada** (token válido); no hay pantallas ni endpoints de administración accesibles sin haber iniciado sesión.
- Además del filtrado de datos por rol descrito arriba, el sistema aplica una **verificación de rol directamente en el servidor** sobre los endpoints administrativos de creación, eliminación y modificación de usuarios, empresas y procesos: estas operaciones están restringidas exclusivamente al rol Administrador. Este control se ejecuta en el backend antes de procesar la solicitud, por lo que bloquea la operación incluso si se intentara invocar el endpoint directamente (por ejemplo, mediante una llamada a la API fuera de la interfaz visual), no solo cuando el usuario navega por las pantallas del sistema.

---

## Protección de Datos

### 6. Sanitización contra inyección SQL, XSS y ataques de correo

- **Inyección SQL:** todo el acceso a la base de datos se realiza mediante el ORM **SQLAlchemy**, que utiliza consultas parametrizadas (*prepared statements*) en el 100% de las operaciones que reciben datos del usuario. No existe construcción de consultas SQL mediante concatenación de texto, que es la causa habitual de este tipo de vulnerabilidad. Esto elimina de forma estructural el riesgo de inyección SQL en los formularios y endpoints de la aplicación.
- **Cross-Site Scripting (XSS):** las vistas del sistema se generan con el motor de plantillas **Jinja2**, que aplica *auto-escape* de HTML de forma predeterminada en absolutamente todas las páginas — es decir, cualquier dato ingresado por un usuario se muestra siempre como texto plano y nunca se interpreta como código ejecutable, salvo que se desactive explícitamente esta protección (lo cual no ocurre en ninguna vista del sistema actual). A esto se suma la validación de formato en los campos críticos (RUT, correo, montos, contraseñas).
- **Ataques relacionados con correo electrónico:** las direcciones de correo se validan contra el estándar internacional (RFC 5322) antes de cualquier envío, y adicionalmente se verifica que el dominio de destino esté autorizado. El envío de correos se realiza mediante librerías estándar que construyen las cabeceras del mensaje de forma segura, evitando la técnica de "inyección de cabeceras" (*email header injection*) usada para spam o suplantación. El envío de códigos de verificación (OTP) por correo está además limitado en frecuencia para evitar abuso del canal.
- **Cabeceras de seguridad HTTP (defensa en profundidad):** el servidor agrega automáticamente a cada respuesta un conjunto de cabeceras de seguridad estándar de la industria: **Content-Security-Policy** (restringe qué scripts y recursos puede cargar el navegador, mitigando el impacto de un eventual XSS), **X-Frame-Options** (evita que el sitio pueda ser embebido en un iframe de un tercero, protegiendo contra *clickjacking*), **X-Content-Type-Options**, **Referrer-Policy** y **Permissions-Policy** (esta última deshabilita por defecto el acceso del sitio a cámara, micrófono y geolocalización del navegador). Adicionalmente, la política de **CORS** (control de qué sitios externos pueden consumir la API) está restringida a una lista explícita de orígenes autorizados, configurable por entorno.

### 7. Certificado SSL

*Aclaración importante: nuestro equipo no administra el hosting ni el dominio de producción, por lo que la emisión, renovación y configuración final del certificado SSL/TLS es responsabilidad del proveedor de hosting donde se aloje el sistema. A continuación detallamos lo que sí está contemplado a nivel de aplicación:*

- El sistema está preparado para operar bajo HTTPS: las cookies de sesión se marcan automáticamente como **"Secure"** cuando detectan que la conexión se realiza por HTTPS, evitando que viajen por una conexión no cifrada.
- El sistema envía activamente en cada respuesta la cabecera de seguridad **HSTS (Strict-Transport-Security)**, cuyo propósito es forzar al navegador a usar siempre HTTPS una vez que el certificado esté activo en el dominio de producción, evitando así intentos de degradar la conexión a HTTP.
- La renovación automática del certificado (por ejemplo, vía Let's Encrypt u otro proveedor) y el forzado de HTTPS a nivel de servidor/dominio deben configurarse en la capa de hosting elegida por el cliente, ya que esa infraestructura está fuera del alcance de nuestro desarrollo. Quedamos disponibles para asesorar en esa configuración si se nos indica el proveedor de hosting definitivo.

---

## Continuidad y Mantenimiento

*Al igual que en el punto anterior, la infraestructura de hosting no es administrada por nuestro equipo. Respondemos en base a lo contemplado en el proyecto entregado; la implementación final de estos puntos dependerá de la configuración del proveedor de hosting que el cliente contrate.*

### 8. Backups

El proyecto incluye actualmente dos mecanismos de respaldo:

- **Respaldo automático local (activo):**
  - Implementado mediante el servicio `db-backup`, integrado directamente en `docker-compose.yml`.
  - Genera automáticamente volcados comprimidos (`.sql.gz`) de la base de datos PostgreSQL de forma **diaria**, almacenados en el servidor en la ruta `./backups/db`.
  - Mantiene una política de retención histórica automática: conserva los respaldos de los últimos 7 días, 4 semanas y 12 meses, evitando tanto la pérdida de historial como la saturación del disco.

- **Plantilla de respaldo completo con sincronización a AWS S3 (lista para configurar):**
  - Script `scripts/backup_s3.sh`, incluido en el proyecto, completamente comentado y guiado paso a paso en español.
  - Genera copias tanto de la base de datos PostgreSQL como de las carpetas de archivos adjuntos de la aplicación (`PDF_autorizaciones` y `PDF_firmados`).
  - Incluye la lógica para subir de forma segura estos archivos a un bucket remoto de AWS S3 (queda comentada intencionalmente, a la espera de que el cliente defina y configure su propio bucket y credenciales de AWS).
  - Incluye instrucciones para programar su ejecución automática como tarea del sistema operativo (`cronjob`).

**Procedimiento de restauración:** ante una falla crítica, la restauración se realiza a partir del volcado más reciente (`.sql.gz`) mediante el procedimiento estándar de PostgreSQL (`pg_restore`/`psql`), un mecanismo ampliamente documentado y confiable. Recomendamos, como buena práctica adicional, formalizar esto en un instructivo paso a paso y ejecutar al menos una prueba de restauración completa antes de la puesta en producción, de forma que el procedimiento quede validado y no solo disponible en teoría.

### 9. Plan de mantenimiento y actualizaciones de seguridad

El proyecto cuenta con un **pipeline automatizado de seguridad** (integrado en el repositorio de código) que se ejecuta de forma **diaria** y también ante cada actualización del código, realizando:

- Escaneo de vulnerabilidades conocidas (CVE) en todas las librerías utilizadas por el sistema.
- Detección de dependencias desactualizadas.
- Verificación de licencias de software de terceros.
- Generación de un inventario completo de componentes (SBOM) y un reporte consolidado en PDF.

Este mecanismo permite detectar de forma temprana y continua si alguna librería utilizada por FlujoPago presenta una vulnerabilidad reportada públicamente, mucho más frecuente que una revisión manual mensual.

Es importante distinguir entre la **detección** de estas alertas (automatizada, como se describe arriba) y su **aplicación** (actualizar una librería, probar que no rompa funcionalidad y desplegar el cambio), que sigue requiriendo intervención de un desarrollador. Nuestra recomendación es mantener una revisión mensual de estos reportes para priorizar y aplicar las actualizaciones pertinentes.

Respecto a si este servicio de mantenimiento evolutivo está incluido en el valor del proyecto o corresponde a un servicio adicional, esto depende del acuerdo comercial vigente con el cliente — recomendamos confirmarlo directamente con su ejecutivo comercial para evitar ambigüedades.

---

*Documento generado en base a una auditoría técnica del código fuente del sistema FlujoPago. Ante cualquier consulta adicional sobre algún punto en particular, quedamos disponibles para profundizar o entregar evidencia técnica complementaria.*
