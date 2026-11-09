# Auditoría de endpoints del backend — noviembre 2026

Se auditaron los **65 endpoints** de negocio del backend FastAPI y se detectaron **45 fallas reales**. Se corrigieron 33, entre ellas **todas las de severidad CRÍTICA y ALTA**, sin cambiar los contratos que usa el frontend React. Las 12 restantes (MEDIO, BAJO e INFO) quedan documentadas aquí y, cuando aplica, con un test `xfail(strict=True)` que vigila el riesgo.

| Severidad | Total | Corregidas | Pendientes |
| --- | --- | --- | --- |
| CRÍTICO | 4 | 4 | 0 |
| ALTO | 11 | 11 | 0 |
| MEDIO | 15 | 12 | 3 |
| BAJO | 8 | 6 | 2 |
| INFO | 7 | 0 | 7 |

| Suite | Antes de la auditoría | Después |
| --- | --- | --- |
| Unitaria (`app/tests`) | 35 pasan, **44 omitidas en silencio** (faltaba `pytest-asyncio`) | 79 pasan |
| Integración real (`tests/integration`) | No existía. Sobre el código original: 63 fallos | 267 pasan, 4 xfail documentados, 0 fallos |

## Cómo ejecutar las pruebas

```bash
scripts/run_backend_tests.sh                # unitarias + integración (PostgreSQL y Redis efímeros en Docker)
scripts/run_backend_tests.sh integration -k solicitudes   # argumentos de pytest
KEEP_CONTAINERS=1 scripts/run_backend_tests.sh            # conserva los contenedores entre corridas
```

- La suite de integración ejecuta la aplicación completa (middlewares, dependencias y servicios) contra una BD real aislada. **Se niega a correr si el nombre de la BD no contiene `test`.**
- Cada test parte de un dataset determinista (6 usuarios: Administrador, 2 Solicitantes con obras distintas, Solicitante sin obra, Aprobador RRHH y Finanzas). También vacía Redis, limpia cookies, borra los PDF que crea y reemplaza el envío de correo por un doble.
- Cada test verifica el código HTTP **y** el estado real en BD, disco y Redis (persistencia, rollback, efectos secundarios y aislamiento).

## Hallazgos

### Críticos (todos corregidos)

| ID | Problema | Corrección | Test de regresión |
| --- | --- | --- | --- |
| H-01 | `PATCH /todas_solicitudes/{id}`: el dueño podía fijar cualquier `estado` (hasta `APROBADO FINANZAS` o `PAGADO`) y saltarse RRHH, Subgerencia y Finanzas | El dueño solo ejecuta las transiciones que ofrece la UI: enviar/reenviar (→ `PENDIENTE`/`ESPERANDO`) y "modificar y reenviar" (`PENDIENTE→N1`, `N1→N2`) si la solicitud fue devuelta (`modificacion_solicitud`) o es tipo `Recepcionado` | `test_dueno_no_puede_autoaprobarse`, `test_dueno_conserva_transiciones_del_flujo_de_correccion` |
| H-01b | `POST /recepcionado` sin control de rol (se podía crear un recepcionado `PAGADO`) | Solo Administrador, Supervisor, Responsable Finanzas o cargo Jefe de Finanzas (los que ven la pantalla Finanzas) | `test_solo_finanzas_o_admin_pueden_recepcionar` |
| H-02 | `POST /todas_solicitudes`: el Solicitante elegía el estado inicial | Sin rol de gestión: solo `ESPERANDO`/`PENDIENTE` (`403` en otro caso) | `test_solicitante_no_puede_crear_en_estado_avanzado` |
| H-32 | El seed creaba un usuario **Administrador** `casa2301teo@gmail.com` con contraseña publicada en el código, y el super administrador tenía una contraseña por defecto en el código | Se eliminó la cuenta del seed. `desactivar_credenciales_de_prueba()` neutraliza en cada arranque la cuenta antigua si conserva la clave publicada: nueva clave aleatoria, cambio obligatorio, 2FA desactivado y dispositivos revocados (no se borra ni cambia su rol). Sin `SEED_SUPER_ADMIN_PASSWORD` se genera una clave aleatoria. La lista blanca de emails es configurable (`EMAILS_PRUEBA_PERMITIDOS`) | `TestCredencialesDePrueba` |

### Altos (todos corregidos)

| ID | Problema | Corrección | Test de regresión |
| --- | --- | --- | --- |
| H-03 | Un `.html` subido como respaldo se guardaba con su extensión y se servía como `text/html` desde el mismo origen (XSS almacenado) | Extensión `.pdf` forzada; las descargas de tipos que no son PDF se entregan como `attachment` binario | `test_archivo_no_pdf_no_se_sirve_como_html`, `test_archivo_html_legado_no_se_renderiza_inline` |
| H-04 | Los listados sin `limit` se truncaban **en silencio** a 200 filas sin `ORDER BY` (500 en histórico); el frontend no pagina, así que desaparecían registros de las bandejas | Sin `limit`/`offset` se devuelven todos, ordenados por clave primaria, hasta `LISTADO_MAX_REGISTROS` (10 000), con advertencia en el log al alcanzarlo. La paginación explícita no cambia | `TestListadosCompletos` |
| H-05 | `GET /usuarios` abierto a cualquier usuario (emails, RUT, cargos) | `require_admin` (solo lo usa Administración) | `test_solicitante_no_puede_listar_usuarios` |
| H-05b | `/historico/estado`, `/historico/solicitante` y `/historico/estadisticas` no filtraban por usuario ni obra | Mismo filtro de alcance que `GET /historico` | `TestHistorico` |
| H-06 | `solicitante` era texto libre y la propiedad se aceptaba por nombre: se podía registrar a nombre de otro, y los homónimos se controlaban entre sí | Sin rol de gestión, `solicitante` debe ser el propio nombre (si no, se usa el de la sesión). La coincidencia por nombre no da control si el `usuario_id` del registro es de un homónimo; se conserva para registros heredados sin `usuario_id` o cargados por terceros | `TestPropiedad` |
| H-07 | IDOR en `POST`/`DELETE /todas_solicitudes/{id}/pdf` | Misma autorización que `PATCH` | `TestPdfFolio` |
| H-07b | IDOR en `guardar-como-solicitud`, `reenviar` y PDFs de `/recepcionado/{id}` | Dueño o alta visibilidad | `TestGuardarComoSolicitud`, `TestReenviar`, `TestPdfRecepcionado` |
| H-07c | `/pdf-firmado/*` y `/pdf-registro-autorizacion/*` abiertos a cualquier usuario | Solo roles del flujo | `test_solicitante_no_puede_cargar` / `_eliminar` |
| H-14 | `fecha_emision` usaba `default=date.today()` (evaluado al importar): toda solicitud recibía la fecha de arranque del servidor | `default=date.today` | `test_fecha_emision_por_defecto_se_evalua_en_cada_insercion` |
| H-23 | Al recepcionar, `usuario_id` pasaba a ser el de Finanzas y el solicitante perdía la propiedad | Se hereda el dueño de la solicitud de origen (`id_solicitud_origen`) | `test_recepcion_conserva_al_dueno_original` |
| H-26 | PDF firmado/autorización se aplicaban por ID a la vez en solicitudes **y** recepcionados (secuencias distintas): la solicitud N contaminaba al recepcionado N, también en el histórico | Parámetro opcional `origen` (`solicitud` por defecto, que es lo que envía el frontend, o `recepcionado`). Solo se actualiza esa tabla, y el histórico se empareja por id **y** folio | `TestDocumentosSinContaminacion` |

### Medios

| ID | Problema | Estado |
| --- | --- | --- |
| H-09 | `PUT /usuarios/{id}` con email/RUT de otro usuario → 500 | Corregido: `400` + rollback |
| H-10 | `DELETE /usuarios/{id}` con solicitudes asociadas → 500 | Corregido: `409` |
| H-11 | Empresas: código duplicado (POST) o datos de otra empresa (PUT) → 422/500 | Corregido: `400` |
| H-12 | `/procesos`, `guardar-como-solicitud` y `reenviar` devolvían el texto SQL del driver | Corregido: mensaje genérico, detalle solo en el log |
| H-19 | `PATCH` sobrescribía `monto` pese a la regla "monto original inmutable" | Corregido: se ignora (igual que en recepcionados) |
| H-20 | Quitar todos los folios → `IntegrityError` → 500 | Corregido: `400` |
| H-24 | `guardar-como-solicitud` respetaba el estado enviado (la regla exige `PENDIENTE`) | Corregido |
| H-27 | `/login` devolvía `str(e)` en el 500 | Corregido |
| H-29 | `/mfa/*`, `/password/*` y `send-temp-password` respondían **HTTP 200** con `status:"error"` | Corregido: código HTTP real, mismo cuerpo (compatible con `client.ts`) |
| H-30 | Crear usuario con email/RUT duplicado: el servicio devolvía 2 valores y la ruta desempaquetaba 3 → 422 genérico | Corregido |
| H-33 | 44 tests async nunca corrían (faltaba `pytest-asyncio`) | Corregido: `requirements-dev.txt` y script |
| H-42 | El nombre "normalizado" usaba `str(None)` (`"ana None perez None"`), por lo que el respaldo por nombre nunca coincidía para usuarios sin segundo nombre/apellido | Corregido en `permisos.nombres_usuario` |
| H-08 | Unicidad de folio validada con `SELECT` previo y sin restricción en BD: dos altas simultáneas duplican el folio | **Pendiente**: requiere restricción/bloqueo en BD (`test_creaciones_concurrentes_no_duplican_folio`, xfail) |
| H-15 | JWT no revocables: un usuario eliminado o con clave restablecida mantiene acceso hasta 24 h | **Pendiente**: lista de revocación o verificación en BD (xfail) |
| H-16 | `/mfa/disable` sin límite de intentos | **Pendiente** (xfail) |

### Bajos e informativos

| ID | Sev. | Problema | Estado |
| --- | --- | --- | --- |
| H-13 | BAJO | `limit`/`offset` negativos → 500 | Corregido: `422` |
| H-18 | BAJO | Un alta rechazada dejaba PDFs huérfanos | Corregido |
| H-22 | BAJO | `field_name` inválido en PDF de solicitud → 500 | Corregido: `400` |
| H-25 | BAJO | `/historico/estado/PAGADO` → 400 | Corregido |
| H-28 | BAJO | `/logout` con 2FA pendiente → 403 y la cookie no se borraba | Corregido |
| H-31 | BAJO | Montos por folio negativos aceptados | Corregido: `ge=0` |
| H-17 | BAJO | Mismo folio repetido dentro de una solicitud | Pendiente (xfail) |
| H-21 | BAJO | `PATCH` de un ID inexistente: 404 para el dueño, 400 para roles de gestión | Pendiente |
| H-34 | INFO | `/login` distingue email inexistente (404) de clave errónea (401) | Documentado (contrato actual) |
| H-35 | INFO | Si Redis cae, el rate limit falla en abierto | Documentado |
| H-36 | INFO | `reset-password` devuelve la clave temporal al admin (la usa `TempPasswordModal`) | Documentado |
| H-37 | INFO | Un admin puede eliminar su propia cuenta | Documentado |
| H-38 | INFO | Reemplazar el PDF de un folio deja el archivo anterior en disco | Documentado |
| H-39 | INFO | CORS no incluye `PATCH` (sin impacto: SPA del mismo origen) | Documentado |
| H-40 | INFO | `PUT /empresas` no normaliza a mayúsculas como `POST` | Documentado |

## Cambios de comportamiento relevantes para integradores

Ningún cambio requiere modificar el frontend actual. Los cambios visibles para otros clientes de la API son:

- **Códigos HTTP**: los errores de 2FA y contraseña ya no responden 200; ahora responden 400/401/403/429 con el mismo cuerpo. Otros cambios: eliminar un usuario con datos asociados responde `409`, `limit`/`offset` negativos responden `422`, y varios errores de integridad pasan de `500` a `400`.
- **Permisos nuevos (en el backend, antes solo en la UI)**: transiciones de estado del dueño, `POST /recepcionado`, PDFs ajenos, `GET /usuarios`, alcance del histórico y documentos del flujo. La tabla completa está en [DOC_API_DOCUMENTATION.md](../DOC_API_DOCUMENTATION.md#reglas-de-autorización-por-registro).
- **`origen`** (opcional) en `/pdf-firmado/*` y `/pdf-registro-autorizacion/*`. Por defecto vale `solicitud`; antes se escribía en ambas tablas.
- **Listados sin paginar** devuelven todo, ordenado, hasta `LISTADO_MAX_REGISTROS`.
- **Variables de entorno nuevas**: `LISTADO_MAX_REGISTROS` y `EMAILS_PRUEBA_PERMITIDOS`. `SEED_SUPER_ADMIN_PASSWORD` ya no tiene valor por defecto.

## Archivos principales

| Archivo | Rol |
| --- | --- |
| `app/infrastructure/security/permisos.py` | Reglas de autorización por registro (roles, propiedad con homónimos, transiciones del dueño) |
| `app/domain/services/documentos_flujo_service.py` | Tabla de `origen` e histórico por id + folio para PDF firmado/autorización |
| `app/infrastructure/utils/pagination_utils.py` | Listados completos y ordenados, tope configurable y validación de negativos |
| `app/infrastructure/db/db_seed.py` | Seed sin credenciales fijas y `desactivar_credenciales_de_prueba()` |
| `tests/integration/` | Suite de integración real (un archivo por dominio; `test_criticos_altos.py` cubre la segunda fase) |
| `scripts/run_backend_tests.sh` | Ejecución reproducible y aislada |

## Pendiente fuera del backend

- Ejecutar el e2e de Playwright (`frontend/e2e`) como regresión de UI tras estos cambios.
- En producción: definir `EMAILS_PRUEBA_PERMITIDOS=` y revisar en el log del primer arranque posterior si aparece `[SEGURIDAD] Cuenta de prueba ... deshabilitada`.
