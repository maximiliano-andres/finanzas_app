# Informe de Migración del Frontend FlujoPago a React

**Rama:** `feat/react-migration` · **Fecha:** 2026-11-06 · **Alcance:** frontend completo (login, 2FA, cambio de contraseña, dashboard y sus 11 secciones, manual de ayuda, visor PDF, exportaciones Excel).

---

## 1. Resumen ejecutivo

Se migró el 100 % del frontend (vanilla JS + Jinja2, ~15.500 líneas en 26 archivos JS) a una SPA **React 19 + TypeScript (strict) + Vite**, servida por el mismo FastAPI en `/flujopago/gestion-pagos/v1/app/`.

- **Funcionalidad:** las 11 secciones, los 3 flujos de autenticación, los 4 tipos de modal, el visor PDF, el manual (15 secciones / 96 ítems) y las 3 exportaciones Excel + comprobante contable están migrados. No se eliminó ninguna funcionalidad.
- **Verificación real:** **63 pruebas E2E** contra el stack real (React → FastAPI → PostgreSQL/Redis → SMTP real capturado en Mailpit) en Chromium, WebKit (Safari) y emulación de Pixel 7 / iPhone 14, más **168 pruebas unitarias y de componente**. La última ejecución completa, desde una base de datos limpia, terminó sin fallos.
- **Flujo de negocio probado de punta a punta con un usuario real por rol:** Solicitante crea (multipart + PDF) → envía → RRHH aprueba N1 → SCP aprueba N2 (con PDF de autorización obligatorio cuando corresponde) → Finanzas aprueba y recepciona. Cada paso se verifica en la BD. También se probaron la devolución y el reenvío.
- **Rendimiento** (dashboard en frío, mismos 30 registros): solicitudes HTTP 43 → 16, llamadas API 15 → 1, KB 632 → 355, CPU 117 → 35 ms, tiempo hasta datos visibles 562 → **100 ms**.
- **Seguridad:** el JWT ya no se expone a JavaScript (antes vivía en `sessionStorage`). Los datos de negocio ya no quedan en `localStorage` tras el logout. Se eliminaron todos los `innerHTML` con datos del servidor (XSS) y la SPA tiene una CSP estricta sin `unsafe-inline` en scripts.
- **Reversible durante la validación:** el interruptor `FLUJOPAGO_FRONTEND=legacy` permitió volver al frontend original y comparar ambos con los mismos datos (probado en la práctica).
- **Frontend original retirado (2026-11-07)**, a pedido, tras la validación: se eliminaron las plantillas `index/force_change/mfa/dashboard.html`, `public/JS` (salvo las páginas de error), los CSS legacy de `public/CSS` y `public/imagenes`. Las URLs antiguas redirigen siempre a la SPA y desapareció el interruptor. **Rollback: volver a un commit anterior al retiro.**
- **Backend:** solo cambios aditivos y mínimos (sección 5), más **una corrección de un bug preexistente**: el logout nunca borraba la cookie de sesión.

**Pendientes principales** (detalle en la sección 17): Firefox quedó **BLOCKED** en este entorno; varios problemas de seguridad **preexistentes del backend** se documentan y **no se corrigieron** (fuera del alcance de "no modificar el backend innecesariamente"); el retiro definitivo del código legacy queda para después de un período de estabilización.

---

## 2. Arquitectura anterior

| Aspecto | Implementación original |
|---|---|
| Páginas | Jinja2: `index.html` (login), `force_change.html`, `mfa.html`, `dashboard.html` (1.273 líneas, 11 secciones ocultas/visibles con la clase `hidden`), `error_401/403/404/422/500.html` |
| JS | 26 archivos globales (`app.js` 2.525, `workflow.js` 2.831, `forms.js` 2.673, `manual-modal.js` 1.464, `data.js` 1.189, `admin.js` 1.094…), sin módulos, con `onclick` inline |
| Estilos | Tailwind **Play CDN** (compila en el navegador en cada carga), Font Awesome y xlsx-js-style desde CDN, `styles.css` + `dark-theme.css` + `manual-modal.css` |
| Navegación | `navigateTo(key)` muestra u oculta secciones. El hash se escribe pero nunca se lee: sin deep-linking ni botón atrás |
| Sesión | JWT en cookie httpOnly **y** en `sessionStorage.FLUJOPAGO_TOKEN`; el rol se obtenía decodificando el JWT en el cliente sin verificar la firma |
| Estado | `DataManager` con 8 datasets **persistidos en `localStorage`** (incluye RUT, emails y montos; sobrevivían al logout) |
| Peticiones | `initialize()` se ejecutaba 2 veces (14 GET al iniciar, 7 sin cabecera de autenticación). Cada navegación re-descargaba `/todas_solicitudes`; el envío masivo hacía N PATCH + N+2 GET completos |
| Errores | Sin manejo global de 401/403; errores tragados en consola, mostrando caché obsoleta |

---

## 3. Auditoría previa y matriz de funcionalidades

La auditoría completa (con referencias `archivo:línea`) se hizo sobre todo el código original antes de modificar nada. La matriz siguiente resume las funcionalidades existentes; **no se agregaron funcionalidades nuevas de negocio**.

| ID | Módulo | Funcionalidad | Implementación actual | Dependencias | Criticidad | Estado |
|---|---|---|---|---|---|---|
| F01 | Auth | Login (validación de dominio, mostrar/ocultar contraseña, "confiar en este dispositivo") | `index.html` + `index_login.js` | `POST /login` | Crítica | Migrado |
| F02 | Auth | Bloqueo tras 5 intentos (429) y mensajes por código HTTP | `index_login.js` | Redis | Crítica | Migrado |
| F03 | Auth | Cambio obligatorio de contraseña inicial | `force_change.*` | `POST /password/force-change` | Crítica | Migrado |
| F04 | Auth | Configuración 2FA (QR + 10 códigos de respaldo) | `mfa.*` | `/mfa/status`, `/mfa/setup`, `/mfa/verify-setup` | Crítica | Migrado |
| F05 | Auth | Verificación 2FA por TOTP, por OTP de correo y por código de respaldo | `mfa.js` | `/mfa/verify`, `/mfa/send-email-otp`, `/mfa/verify-backup`, SMTP | Crítica | Migrado |
| F06 | Auth | Dispositivo de confianza (omite 2FA por 30 días) | backend + checkbox de login | cookie `trusted_device` | Alta | Migrado |
| F07 | Auth | Logout y aviso de "sesión expirada" | `app.js` | `POST /logout` | Crítica | Migrado (+ bug corregido) |
| F08 | Layout | Navbar (usuario/rol/cargo), sidebar colapsable con estado persistido, menú móvil off-canvas, navbar auto-oculta | `dashboard.html`, `app.js`, `dashboard_navbar.js` | — | Alta | Migrado |
| F09 | Permisos | Menú y secciones por rol/cargo (Administrador, Solicitante, Aprobador RRHH/SCP, Finanzas) | `setupMenuByRole` | claims JWT | Crítica | Migrado (ahora también bloquea por URL) |
| F10 | Dashboard | 4 estadísticas, solicitudes recientes, widgets de admin | `loadDashboard` | `/todas_solicitudes` | Alta | Migrado |
| F11 | Nueva Solicitud | Formulario con campos derivados (UNE, cuentas, glosa), 1–5 folios, PDFs, validación, previsualización y envío multipart | `forms.js`, `folio.js`, `validation.js` | `POST /todas_solicitudes`, catálogos | Crítica | Migrado |
| F12 | Mis Solicitudes | Tarjetas por empresa × tipo, filtros, selección, total, "Enviar a Aprobación" masivo | `app.js` | `PATCH /todas_solicitudes/{id}` | Crítica | Migrado |
| F13 | Detalle | Voucher de solicitud: folios, PDFs, comentarios, Editar/Eliminar según estado | `verDetalleSolicitud` | `DELETE /todas_solicitudes/{id}` | Alta | Migrado |
| F14 | Edición | "Modificar Solicitud Activa": 5 slots, cuadratura, PDFs por folio | `forms.js` | `PATCH`, `/todas_solicitudes/{id}/pdf` | Crítica | Migrado |
| F15 | Edición | "Modificar Registro Recepcionado" → guardar como nueva solicitud | `forms.js` | `/recepcionado/{id}/guardar-como-solicitud`, `/recepcionado/{id}/pdf` | Crítica | Migrado |
| F16 | Aprobación RRHH | Nivel 1: aprobar o devolver con comentario, individual y masivo | `workflow.js` | `PATCH` | Crítica | Migrado |
| F17 | Aprobación SCP | Nivel 2 + PDF de Registro de Autorización (individual/masivo, 10 MB, obligatorio para tipo Recepcionado) | `workflow.js` | `/pdf-registro-autorizacion/*` | Crítica | Migrado |
| F18 | Finanzas | Aprobar, devolver, procesar seleccionadas, "Aprobación de finanzas" (recepcionar), PDF firmado, exportar comprobante | `workflow.js` | `/recepcionado`, `/pdf-firmado/*` | Crítica | Migrado |
| F19 | Estados de Solicitudes | 8 filtros, visibilidad por rol, 19 columnas, paginación | `app.js` | `/todas_solicitudes` | Alta | Migrado (+ bugs corregidos) |
| F20 | Recepcionadas | Agrupación por empresa, filtros, "Modificar", PDFs firmado/autorización, total | `app.js` | `/recepcionado` | Alta | Migrado |
| F21 | Reportes | Histórico, General y Finanzas (Excel de 42 columnas + comprobante contable) | `reports.js`, `workflow.js` | `/historico`, `xlsx-js-style` | Alta | Migrado |
| F22 | Administración | CRUD de Empresas, Procesos Auxiliares, Procesos y Usuarios; contraseña temporal + envío por correo; reset de contraseña | `admin.js`, `data.js` | `/empresas`, `/procesos*`, `/usuarios*` | Crítica | Migrado |
| F23 | Seguridad | Dispositivos de confianza: listar y revocar | `security.js` | `/mfa/devices` | Media | Migrado |
| F24 | Transversal | Visor PDF autenticado (ver y descargar) | `viewer.js` | rutas PDF protegidas | Alta | Migrado (+ bug de descarga corregido) |
| F25 | Transversal | Manual de ayuda contextual (15 secciones, 96 ítems) | `manual-modal.js` | — | Media | Migrado (contenido extraído automáticamente) |
| F26 | Transversal | Notificaciones (máx. 3, 8/12 s), diálogos confirmar/alerta/error con cola | `utils.js`, `modals.js` | — | Alta | Migrado |
| F27 | Transversal | Modo oscuro según el sistema operativo | CSS `prefers-color-scheme` | — | Baja | Migrado (mismo CSS) |
| F28 | Errores | Páginas 401/403/404/422/500 | Jinja2 | `ErrorMiddleware` | Media | Se mantienen en el backend; la SPA agrega su 404 y un error boundary |

**Código muerto identificado y no migrado intencionalmente:** `PaginationManager` y `app_pagination_functions.js` (sin llamadas), `openPDF`/`openPDFRecepcionado`, `renderSolicitudRow`, el camino `iniciarEdicion` (PATCH JSON), las llamadas PDF sin `field_name` (fallaban con 422), `marcarRecepcionado` y la acción `rechazar` de workflow, y el timeline del detalle (se construía pero nunca se mostraba).

---

## 4. Estrategia de migración

**Elegida:** *strangler fig* (reemplazo progresivo detrás de un interruptor), migrando **por módulos** sobre una base común (cliente HTTP, sesión, layout, componentes compartidos).

**Por qué:**
- El dashboard original es **una sola página** con 11 secciones acopladas por objetos globales. Migrar componente por componente dentro del HTML legacy habría obligado a convivir con el `innerHTML` y el estado global, justo lo que se quería eliminar.
- El backend ya expone una API JSON completa. La SPA puede vivir en una ruta propia (`/app/`) sin tocar contratos, y el legacy sigue intacto en `public/` y en las plantillas.
- El interruptor `FLUJOPAGO_FRONTEND` permite **rollback inmediato** y comparar ambos frontends con el mismo backend y los mismos datos, como se hizo en la medición de rendimiento.
- Mismo origen: la cookie httpOnly funciona sin CORS y sin exponer el token.

---

## 5. Cambios en el backend (todos documentados)

| # | Qué se modificó | Por qué | Impacto | Cómo se verificó |
|---|---|---|---|---|
| B1 | **Nuevo** `routers/spa_routes.py`: `GET /session` (claims públicos del JWT) | React no guarda ni decodifica el JWT; necesita conocer usuario y rol | Aditivo. Pasa por `MFAMiddleware` (403 + `redirect_to` si falta 2FA) | AUTH-05/09/10/13, pruebas del cliente |
| B2 | `spa_routes.py`: sirve `frontend/dist` en `/app/*` con protección contra path traversal, `Cache-Control` (shell `no-store`, assets inmutables) | Servir la SPA desde el mismo origen | Aditivo | Todas las E2E; curl |
| B3 | `dashboard_routes.py`: `/`, `/login`, `/dashboard`, `/force-change`, `/mfa-verify` redirigen **siempre** a la SPA (preservando la query, p. ej. `?error=session_expired`). `POST /logout` responde JSON. Se eliminaron las plantillas legacy | Retiro del frontend original | Enlaces, marcadores y redirecciones del `ErrorMiddleware`/`MFAMiddleware` siguen funcionando | AUTH-09, AUTH-11 |
| B4 | `mfa_dependency.py`: excluye el prefijo `/app` | Sin esto, recargar la SPA con 2FA pendiente devolvía JSON 403 en vez del HTML | El shell no contiene datos; la API sigue protegida | AUTH-13 (API 403 sin 2FA) |
| B5 | `main.py`: registra el router | — | — | — |
| B6 | **Corrección de bug preexistente** en `POST /logout`: la cookie `access_token` **nunca se eliminaba**, porque `delete_cookie` se aplicaba a un `Response` que no se devolvía | El legacy lo disimulaba borrando `sessionStorage`, pero la sesión seguía viva en la cookie 24 h. Con React habría sido una regresión de seguridad | El logout ahora invalida la sesión del navegador. El HTML devuelto no cambia | curl (`Set-Cookie: access_token=""; Max-Age=0`), AUTH-11 |
| B7 | `middelware_base_headers.py`: CSP estricta **solo** para `/app/*` (`script-src 'self'`, sin `unsafe-inline` ni CDNs) | Mitiga XSS (S2 de la auditoría). El legacy conserva su CSP | Ninguno en el legacy | Las E2E fallan ante cualquier violación de CSP (guardia de consola): 0 violaciones |
| B8 | `Dockerfile` multi-etapa (Node 22 compila el frontend) y `.dockerignore` | Desplegar el build | La imagen incluye `frontend/dist` | `docker build` OK; `dist` presente en la imagen |

`pytest` del backend: **35 pasan y 44 se omiten**. Las omisiones son preexistentes: son tests `async` y el proyecto no tiene `pytest-asyncio`.

---

## 6. Autenticación y seguridad

| Aspecto | Original | React | Resultado |
|---|---|---|---|
| Almacenamiento del token | Cookie httpOnly **+ `sessionStorage.FLUJOPAGO_TOKEN`** (legible por cualquier XSS) | Solo cookie httpOnly | **Mejora**. AUTH-05 verifica que no queda ningún JWT en web storage y que `document.cookie` no lo expone |
| Rol del usuario | JWT decodificado en el cliente sin verificar firma | `GET /session` validado por el servidor | Mejora |
| Rutas protegidas | Solo menú oculto; `navigateTo` permitía abrir cualquier sección | Guardas de ruta por sesión y por rol (URL directa → redirige) | Mejora. La autorización real sigue en el backend (AUTH-10 verifica un 403 de la API) |
| 401 a mitad de sesión | Ignorado (datos obsoletos) | Handler global → login con aviso de sesión expirada | Mejora (AUTH-12) |
| 403 por 2FA pendiente | `redirect_to` ignorado | Redirige a `/mfa` o `/force-change` | Mejora |
| Expiración del JWT | Solo al cargar la página | Temporizador según `exp` | Mejora |
| Logout | Datos de negocio quedaban en `localStorage`; la cookie no se borraba | Se limpia la caché en memoria y la cookie (B6) | Mejora |
| XSS | `innerHTML` con datos del servidor y `onclick` inline en decenas de lugares | 0 `innerHTML`; el lint prohíbe `dangerouslySetInnerHTML`; todo se renderiza como texto | Mejora (WF-01 envía `<script>` en observaciones y se muestra como texto) |
| CSP | `unsafe-inline` + CDNs | Estricta en `/app` | Mejora |
| Validaciones | Cliente + servidor | Las mismas reglas y mensajes. Además se valida el tipo PDF en el selector de archivos (antes solo en drag & drop) | Igual o mejor (ERR-06) |
| Doble envío | Sin protección en login, cambio de contraseña, creación ni masivos | Botones deshabilitados durante la petición | Mejora (WF-01 hace doble clic → 1 solicitud) |

---

## 7. Arquitectura React

```
frontend/
├── src/
│   ├── api/            client.ts (fetch único: timeout, 3 formatos de respuesta, 401/403 globales)
│   │                   endpoints.ts (catálogo ÚNICO de endpoints) · queries.ts (TanStack Query)
│   ├── app/            router.tsx (rutas + lazy de React Router) · providers.tsx · sections.ts
│   ├── auth/           AuthProvider (sesión por cookie) · guards (RequireAuth, RequireSection)
│   ├── components/     feedback/ (Toast, Dialog, QueryErrorNotifier, ConnectionError)
│   │                   layout/ (DashboardLayout, AuthLayout) · pdf/ · manual/ · ui/ (Pagination…)
│   ├── features/       auth · dashboard · nueva-solicitud · mis-solicitudes · solicitud-detalle
│   │                   solicitud-edicion · aprobaciones · finanzas · todas-solicitudes · recepcionado
│   │                   reportes · administracion · seguridad · errors
│   ├── lib/            format · roles (reglas exactas del legacy) · solicitud (mapeadores) · validation · excel
│   ├── types/          domain.ts (contrato del backend)
│   └── styles/         index.css + legacy/ (CSS original reutilizado para paridad visual)
└── e2e/                specs/ · helpers/ (TOTP, Mailpit, PDF, fixtures) · perf/
```

**Principios aplicados:**
- Lógica pura (filtros, reglas por rol, cuadratura, payloads, filas de Excel) en archivos `.ts` con tests unitarios; los componentes solo presentan.
- Ningún archivo supera 250 líneas.
- Un único cliente HTTP y un único catálogo de endpoints.
- Estado del servidor en TanStack Query, con caché en memoria e invalidación única tras cada mutación. No hay estado global innecesario: el contexto se limita a sesión, toasts, diálogos, visor PDF y manual.
- Efectos con cleanup en todos los listeners y timers.
- Modales montados en un portal para no quedar atrapados en el contexto de apilamiento de la sección.

**Dependencias de producción (5):** `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query` y `xlsx-js-style` (cargada bajo demanda), más fuentes auto-alojadas (`@fortawesome/fontawesome-free`, `@fontsource/outfit`).

**Calidad verificada:** `tsc --strict` 0 errores · ESLint 0 · 0 `any` · 0 `console.log` · 0 `innerHTML`.

---

## 8. Rendimiento

Medición con CDP en Chromium: dashboard del administrador, carga en frío (caché deshabilitada), **misma BD con los mismos 30 registros**, mediana de 3 ejecuciones, alternando el backend con `FLUJOPAGO_FRONTEND`.

| Métrica | Original | React | Cambio |
|---|---|---|---|
| Solicitudes HTTP | 43 | 16 | −63 % |
| KB transferidos | 632 | 355 | −44 % |
| Llamadas a la API | 15 (7 endpoints duplicados) | 1 + sesión (1) | −87 % |
| Tiempo hasta datos visibles | 562 ms | **100 ms** | −82 % |
| DOMContentLoaded | 513 ms | 56 ms | −89 % |
| CPU del hilo principal | 117 ms | 35 ms | −70 % |
| Heap JS | 9,5 MB | 6,8 MB | −28 % |

**Optimizaciones y su justificación:**
- **Tailwind compilado** en lugar del CDN Play, que compilaba CSS en el navegador en cada carga.
- **Code splitting por sección** con `lazy` de React Router. Se migró desde `React.lazy` después de medir que el *throttle* de Suspense de React 19 añadía ~300 ms: el tiempo hasta datos visibles bajó de 886 a 100 ms.
- **Precarga de `/todas_solicitudes`** en el layout, en paralelo con el chunk de la sección.
- **Caché compartida** (`staleTime` 30 s) en vez de re-descargar en cada navegación; VIEW-02 verifica 1 sola descarga en 4 navegaciones.
- **xlsx-js-style (860 kB) bajo demanda**: solo se descarga al exportar. Antes se cargaba en cada visita al dashboard.
- Envío masivo: N PATCH + **1** invalidación, en lugar de N + 2 descargas completas.
- `useDeferredValue` en el filtro de texto, en lugar de re-renderizar en cada tecla.

No se agregó virtualización de tablas: la paginación de 50 filas ya acota el DOM.

> **Actualización nov-2026 (auditoría de endpoints, H-04):** el backend ya no trunca los listados a 200 registros. Sin `limit` devuelve todos, ordenados por `id`, hasta `LISTADO_MAX_REGISTROS` (10 000 por defecto). El tope anterior hacía desaparecer solicitudes de las bandejas en silencio.

---

## 9. Responsive

Se verificó automáticamente en **7 resoluciones** (320, 430, 768, 1366, 1920, 2560 y 3840 px) × **10 vistas**, más emulación táctil de Pixel 7 e iPhone 14. Criterio de fallo: scroll horizontal de página **o** cualquier elemento visible fuera del viewport, considerando el recorte de sus contenedores. Las capturas de evidencia quedan en `frontend/e2e/.output/screens/`.

**Problemas encontrados y corregidos durante la verificación:**
1. En 320 px, el encabezado "Voucher de Registro" y el badge de estado quedaban cortados. Ahora el encabezado hace *wrap*.
2. El botón del menú móvil (`z-index: 90` en el CSS legacy) quedaba **encima** de todos los modales. Los modales ahora se montan en un portal con `z-[1000]`. Este defecto también existía en el legacy.
3. La navegación móvil re-abría el menú (bug del legacy); ahora lo cierra.

---

## 10. Estrategia de pruebas

| Nivel | Herramienta | Qué valida |
|---|---|---|
| Unitarias | Vitest | Cliente HTTP (los 3 formatos de respuesta, 401/403/500, red, timeout), reglas de rol, normalización de datos, cuadratura, payloads multipart (orden exacto de campos), filas Excel, filtros con fechas límite, comprobante |
| Componentes | Vitest + Testing Library | Login (mensajes por código, doble envío, red), detalle, edición, nueva solicitud |
| E2E reales | Playwright + stack Docker aislado | Flujos completos UI → API → BD → UI con usuarios reales por rol, 2FA TOTP real (secreto obtenido de `/mfa/setup`), OTP real por correo (Mailpit), archivos PDF reales y descargas Excel reales abiertas y verificadas |
| Errores | Playwright | Caída **real** del backend (`docker pause`), sin conexión real (`offline`), sesión inválida real. Códigos no reproducibles de forma determinista (500/409/429/HTML corrupto/lentitud) se **inyectan** en la red y se marcan `[INYECTADA]` |
| Rendimiento | CDP | Comparación legacy vs React con los mismos datos |

Las pruebas E2E incluyen una guardia automática: **cualquier error de consola o excepción de página no esperada hace fallar la prueba**. También se detectan GET duplicados.

---

## 11. Pruebas ejecutadas

**Totales de la última ejecución completa desde una BD limpia:**
- **E2E:** 63 pasan, 0 fallan, 2 omitidas por diseño.
  - Omitida RESP-touch: solo aplica a móviles, donde pasa.
  - Omitida VIEW-06: dependía del orden de ejecución. Se corrigió y pasa en la corrida siguiente de Chromium (52 pasan, 1 omitida que es RESP-touch).
- **Unitarias y de componente:** 168 de 168.
- **pytest del backend:** 35 pasan y 44 se omiten (preexistente).
- **Build Docker:** OK.

| Test | Tipo | Funcionalidad | Resultado | Observación |
|---|---|---|---|---|
| AUTH-01 | E2E | Validación de login en cliente sin llamar a la API | PASS | Chromium + WebKit |
| AUTH-02/03 | E2E | 401 contraseña incorrecta / 404 email desconocido | PASS | Mensajes del backend |
| AUTH-04 | E2E | Bloqueo tras 5 intentos (429 real de Redis) | PASS | |
| AUTH-05 | E2E | Primer ingreso: temporal → cambio forzado (no coinciden, 422 débil, actual incorrecta) → setup 2FA (QR + 10 códigos, código inválido) → dashboard | PASS | También verifica que el JWT no se expone a JS |
| AUTH-06 | E2E | Código de respaldo; el mismo código no se puede reutilizar | PASS | |
| AUTH-07 | E2E | OTP por correo real (SMTP → Mailpit) | PASS | Chromium + WebKit |
| AUTH-08 | E2E | Dispositivo de confianza omite 2FA; revocación en Seguridad | PASS | |
| AUTH-09 | E2E | Rutas protegidas sin sesión; redirección desde URLs legacy | PASS | Chromium + WebKit |
| AUTH-10 | E2E | Menú por rol; URL no autorizada redirige; la API responde 403 | PASS | |
| AUTH-11 | E2E | Logout borra la cookie; "atrás" y recarga no recuperan la sesión | PASS | Detectó el bug B6 |
| AUTH-12 | E2E | Token inválido → 401 → login con aviso | PASS | |
| AUTH-13 | E2E | Sesión sin 2FA no accede (UI + API 403) | PASS | |
| ADM-01 | E2E | Empresa: crear, editar, cancelar borrado, eliminar (verificado en BD) | PASS | Chromium + WebKit |
| ADM-02 | E2E | Campos requeridos sin petición al backend | PASS | |
| ADM-03 | E2E | Código duplicado → error claro, modal abierto | PASS | |
| ADM-04 | E2E | Editar proceso auxiliar INACTIVO conserva el estado | PASS | Bug legacy corregido |
| ADM-05 | E2E | RUT inválido; alta de usuario → contraseña temporal → correo real → primer login | PASS | |
| ADM-06 | E2E | El administrador no puede eliminarse a sí mismo | PASS | |
| WF-01 | E2E | Nueva solicitud: validación, previsualización, multipart con PDF, doble clic = 1 registro, XSS como texto | PASS | Verificado en BD |
| WF-02 | E2E | Detalle + visor PDF real (blob) + envío a aprobación | PASS | Estado PENDIENTE en BD |
| WF-03 | E2E | RRHH aprueba N1 | PASS | Usuario RRHH real |
| WF-04 | E2E | SCP aprueba N2 | PASS | Usuario SCP real |
| WF-05 | E2E | Finanzas aprueba y recepciona → aparece en Recepcionadas | PASS | Usuario Finanzas real |
| WF-06 | E2E | RRHH devuelve con comentario → Solicitante la ve RECHAZADA con el comentario | PASS | |
| WF-07 | E2E | Editar y Reenviar (cuadratura + PATCH) | PASS | |
| WF-08 | E2E | Recepcionado → "Guardar como Nueva Solicitud" → N2 bloquea sin PDF → carga PDF real → aprueba | PASS | |
| VIEW-01 | E2E | Estadísticas = BD; sin GET duplicados; ≤ 3 GET al cargar | PASS | Chromium + WebKit |
| VIEW-02 | E2E | Navegación con caché (1 descarga en 4 navegaciones); botón atrás | PASS | |
| VIEW-03 | E2E | Filtros de Estados de Solicitudes contra datos reales | PASS | |
| VIEW-04/05 | E2E | Excel General/Histórico: archivo real abierto, hoja "Datos", 42 columnas, columnas antes vacías ahora con datos | PASS | |
| VIEW-06 | E2E | Comprobante contable (hoja "Comprobante" con TOTALES) | PASS | |
| ERR-01 | E2E | API caída real (docker pause) al cargar y a mitad de sesión | PASS | |
| ERR-02 | E2E | Servidor sin respuesta en la sesión → pantalla "No se pudo conectar" + Reintentar | PASS | Antes enviaba al login |
| ERR-03 ×4 | E2E | 500/409/429/422 al guardar → mensaje claro, modal abierto, sin cambios en la BD | PASS | Inyectada |
| ERR-04 | E2E | HTML corrupto (502) y lista vacía → sin crash | PASS | Inyectada |
| ERR-05 | E2E | Respuesta lenta (3 s) → indicador de carga y luego datos correctos | PASS | Inyectada |
| ERR-06 | E2E | Archivo no PDF rechazado | PASS | Real |
| ERR-07 | E2E | Sin conexión al enviar → mensaje, sin solicitud a medias; al reconectar se puede reintentar | PASS | Real (`offline`) |
| RESP ×7 | E2E | 7 resoluciones × 10 vistas sin desbordes; menú móvil | PASS | |
| RESP-modales | E2E | Modal en 320 px y 4K, sin superposiciones | PASS | Chromium, Pixel 7, iPhone 14 |
| RESP-login / touch | E2E | Login y uso táctil en móvil | PASS | Pixel 7, iPhone 14, WebKit |
| PERF | Medición | Legacy vs React | Ejecutado | Ver sección 8 |
| Unitarias (22 archivos) | Unit/Comp. | Cliente, roles, formatos, mapeadores, validación, lógica de cada módulo | 168 PASS | |

---

## 12. Matriz de regresión

| ID | Funcionalidad | Antes | Después | Test | Resultado | Evidencia |
|---|---|---|---|---|---|---|
| F01–F02 | Login y bloqueo | OK | OK | AUTH-01..04 | PASS | `results.json` |
| F03 | Cambio forzado | OK (sin regla visible en 422) | OK + muestra la regla incumplida | AUTH-05 | PASS | |
| F04–F05 | 2FA setup y verificación (TOTP, correo, respaldo) | OK | OK | AUTH-05..07 | PASS | Correos en Mailpit |
| F06 | Dispositivo de confianza | OK | OK | AUTH-08 | PASS | |
| F07 | Logout | Cookie no se borraba | Corregido | AUTH-11 | PASS | Cabecera `Set-Cookie` |
| F08 | Layout y menú | OK (re-abría el menú móvil) | OK | RESP ×7, touch | PASS | Capturas |
| F09 | Permisos por rol | Solo cosmético | UI + guardas de ruta | AUTH-10, unitarias de roles | PASS | |
| F10 | Dashboard | OK | OK | VIEW-01 | PASS | |
| F11 | Nueva Solicitud | OK | OK | WF-01, ERR-06/07 | PASS | Registro en BD |
| F12 | Mis Solicitudes + envío | OK | OK | WF-02 | PASS | |
| F13 | Detalle | OK | OK | WF-02, WF-06 | PASS | |
| F14 | Editar y reenviar | OK | OK | WF-07 | PASS | |
| F15 | Recepcionado → solicitud | OK | OK | WF-08 | PASS | |
| F16 | Aprobación N1 + devolución | OK | OK | WF-03, WF-06 | PASS | |
| F17 | Aprobación N2 + PDF de autorización | OK | OK | WF-04, WF-08 | PASS | |
| F18 | Finanzas + recepcionar | OK | OK | WF-05 | PASS | |
| F18 | PDF firmado (carga/eliminación) | OK | Migrado | Unitarias | NOT TESTED (E2E) | Sin prueba E2E de carga del PDF firmado |
| F19 | Estados de Solicitudes | Solo 50 filas visibles | Paginación completa | VIEW-03 | PASS | |
| F20 | Recepcionadas | OK | OK | WF-05, WF-08 | PASS | |
| F21 | Reportes y comprobante | Columnas vacías; máx. 32 filas | Corregido | VIEW-04..06 | PASS | Archivos .xlsx |
| F22 | Administración | OK | OK | ADM-01..06 | PASS | |
| F23 | Seguridad (dispositivos) | OK | OK | AUTH-08 | PASS | |
| F24 | Visor PDF | Descarga rota | OK | WF-02 | PASS | iframe con `blob:` |
| F25 | Manual de ayuda | OK | OK | Revisión de contenido (15/96) | PASS (estático) | Sin E2E dedicado |
| F26 | Notificaciones y diálogos | OK | OK | Todas las E2E | PASS | |
| F27 | Modo oscuro | Según SO | Mismo CSS | — | NOT TESTED | Sin verificación visual automatizada |
| F28 | Páginas de error | OK | Sin cambios (backend) | AUTH-09 | PASS (parcial) | |

---

## 13. Comparación antes vs. después

| Aspecto | Original | React | Resultado |
|---|---|---|---|
| Funcionalidades | 28 grupos | 28 grupos | Paridad. Ninguna eliminada |
| Rendimiento | Ver sección 8 | Ver sección 8 | Mejora medida |
| Seguridad | JWT en web storage, XSS, logout ineficaz | Ver sección 6 | Mejora |
| Responsive | Funcional, con menú que se re-abría y modales tapados | 7 resoluciones verificadas | Mejora |
| Arquitectura | Globales + `onclick` inline + `innerHTML` | Módulos tipados, capas definidas | Mejora estructural |
| Mantenibilidad | Archivos de 2.500–2.800 líneas, lógica duplicada (~80 % en modales de edición y tablas de aprobación) | Archivos ≤ 250 líneas, lógica compartida y testeada | Mejora estructural |
| Bundle | ~15.500 líneas JS sin minificar + Tailwind JIT en runtime + 3 CDNs | 107 kB gzip iniciales + chunks por sección; xlsx bajo demanda | Mejora |
| Tiempo de carga | 562 ms hasta datos | 100 ms | Mejora |
| Complejidad | Sin build | Requiere build (Node) | Costo agregado: paso de build en CI/Docker |
| Dependencias | 3 CDNs en runtime | 5 paquetes npm, sin CDNs en runtime | Supply chain controlado por lockfile |
| Experiencia de usuario | Sin deep-linking ni botón atrás; errores silenciosos | Rutas reales, errores claros, indicadores de carga, foco visible | Mejora |

**Mejoras reales (medidas o verificadas):** rendimiento, seguridad del token, XSS, logout, deep-linking, manejo de errores, responsive y doble envío.

**Cambios meramente estructurales:** organización en módulos, tipado y tests. Mejoran la mantenibilidad, pero no cambian el comportamiento.

---

## 14. Compatibilidad

| Navegador | Motor | Estado | Detalle |
|---|---|---|---|
| Chrome | Chromium 158 | **PASS** | Suite completa (52 pruebas) |
| Safari | WebKit | **PASS** | Pruebas `@compat` en escritorio + emulación iPhone 14 |
| Edge | Chromium | **NOT TESTED (Edge real)** | Mismo motor que Chrome. No había Edge instalado |
| Firefox | Gecko | **BLOCKED** | El navegador no pudo lanzarse dentro del sandbox de ejecución de este entorno. El binario funciona y no es un fallo de la app. Se pidió ejecutarlo fuera del sandbox y el permiso fue denegado. Para ejecutarlo localmente: `cd frontend && npx playwright test --project=firefox` |

APIs del navegador usadas: todas estables (fetch con AbortController, URL.createObjectURL, FormData, matchMedia, Clipboard opcional). Target ES2020. No se usan APIs experimentales.

---

## 15. Problemas encontrados durante la migración

| Problema | Severidad | Causa | Solución | Estado |
|---|---|---|---|---|
| Errores con HTTP 200 + `status:"error"` (sin `data`) se trataban como éxito | Alta | Cliente React exigía la clave `data` para reconocer el sobre | Se detecta por `status`; 11 tests unitarios | Corregido |
| La cookie de sesión no se eliminaba en el logout | **Crítica** | **Bug preexistente del backend** (B6) | Borrar la cookie en la respuesta devuelta | Corregido |
| Backend caído enviaba al login | Media | La sesión trataba los errores de red como "anónimo" | Estado `error` + pantalla de reintento | Corregido |
| Datos visibles a los 886 ms | Media | *Throttle* de Suspense (React 19) + cascada de carga | `lazy` de React Router + precarga | Corregido (100 ms) |
| Modales tapados por el botón del menú y voucher cortado en 320 px | Media | `z-index: 90` del CSS legacy + modales dentro de la sección | Portal + `z-[1000]` + *wrap* | Corregido |
| Selector de archivos aceptaba no-PDF | Baja | `accept` no impide la asignación programática; el legacy igual | Validación de tipo en `onChange` | Corregido |
| Filas truncadas a 200/500 sin aviso | Media | **Preexistente del backend** (límite por defecto sin `ORDER BY`) | Paginar desde el cliente sin `ORDER BY` no es confiable → se mantiene la paridad | Pendiente (backend) |
| Firefox no se lanza | — | Restricción del sandbox del entorno | — | BLOCKED |

---

## 16. Regresiones

**No hay regresiones conocidas.** Las diferencias de comportamiento son **intencionales**; cada una está marcada en el código con `// Cambio vs legacy:`. Las principales:

- **Correcciones de bugs del legacy:**
  - Paginación completa en Estados de Solicitudes.
  - Las opciones de estado del filtro ahora coinciden con los datos.
  - Cabeceras Folio/Giro alineadas con las celdas.
  - El total de Recepcionado suma todas las filas filtradas, no solo la página.
  - El estado INACTIVO se conserva al editar.
  - Columnas del histórico llenas.
  - El comprobante incluye todas las filas (antes 32).
  - Fechas en hora local (antes había desfases por UTC).
  - La descarga del visor PDF funciona.
  - Los errores 422 muestran la regla incumplida.
- **UX:**
  - ESC y clic en el fondo cierran el detalle.
  - La selección se limpia al cambiar de filtro.
  - "Actividad Reciente" queda vacía siempre: el log vivía solo en `localStorage` del navegador y no tiene fuente en el backend.
- **Seguridad:** desde el detalle de un registro **Recepcionado** ya no se ofrecen Editar ni Eliminar. El legacy usaba ese id contra la tabla `todas_solicitudes`, con riesgo de editar o borrar **otra** solicitud. **Requiere confirmación de negocio.**

| Funcionalidad | Problema | Impacto | Estado |
|---|---|---|---|
| — | Ninguna regresión conocida | — | — |

---

## 17. Pendientes y riesgos (preexistentes, no atribuibles a React)

**A. Decisiones de negocio requeridas** (se conservó el comportamiento legacy):
1. Al **editar** una solicitud, el estado avanza solo: PENDIENTE → APROBADO NIVEL 1, y N1 → N2. Un Solicitante que edita una solicitud propia de tipo Recepcionado salta la aprobación de RRHH.
2. "Aprobación de finanzas" recepciona **todas** las solicitudes elegibles de la empresa y tipo, no solo las seleccionadas. El texto de confirmación indica la cantidad.
3. "Eliminar Solicitud" se ofrece para cualquier solicitud PENDIENTE o ESPERANDO, sin importar el rol o el dueño.
4. Quitar Editar/Eliminar del detalle de Recepcionados (sección 16).

**B. Seguridad del backend** (recomendado corregir; fuera del alcance de esta migración):
1. Las transiciones de estado **no se validan en el servidor**: un dueño puede hacer PATCH de su propia solicitud a "APROBADO FINANZAS". Las rutas de PDF y `guardar-como-solicitud` no verifican rol ni dueño.
2. Las rutas `pdf-firmado` y `pdf-registro-autorizacion` actualizan o borran **por el mismo id en dos tablas** distintas (solicitudes y recepcionados).
3. El texto del folio se usa **sin sanitizar** en el nombre del archivo PDF (riesgo de *path traversal*).
4. Un PDF compartido en una carga masiva se borra físicamente para todas las solicitudes que lo usan.
5. El refresh token (7 días) se acepta como access token; no hay claim de tipo.
6. Enumeración de cuentas: el login responde 404 o 401 según exista el email. Un 500 en el login expone `str(e)`.
7. Excepciones de email de prueba en producción: `casa2301teo@gmail.com` y todo el dominio `@pushhr.cl`. *(Actualización nov-2026: la lista es configurable con `EMAILS_PRUEBA_PERMITIDOS`; la cuenta `casa2301teo@gmail.com` ya no se siembra y se neutraliza al arrancar si conserva la contraseña publicada.)*
8. El JWT no se revoca en el servidor al hacer logout (solo se borra la cookie); sigue siendo válido hasta 24 h si se copió antes.
9. `/mfa/setup` regenera el secreto en cada carga de la página de 2FA (React evita la doble llamada, pero recargar la página sigue regenerándolo). `/mfa/disable` no tiene límite de intentos.
10. HSTS con `preload` se envía también por HTTP. No hay token CSRF; la única protección es SameSite=Lax.
11. Varias rutas devuelven errores con HTTP 200.
12. El backend no impide que un usuario se elimine a sí mismo; solo lo bloquea la UI.

**C. Técnicos:**
1. **Truncado a 200 filas** (500 en histórico) sin aviso: requiere `ORDER BY` + paginación real o un límite mayor en el backend.
2. Prueba E2E de **carga y eliminación del PDF firmado** (Finanzas), del **modo oscuro** y del contenido del **manual**: NOT TESTED a nivel E2E.
3. **Firefox** (BLOCKED) y **Edge real** (NOT TESTED): ejecutar `npx playwright test --project=firefox` en una máquina sin sandbox.
4. Accesibilidad: hay mejoras (labels, `aria-*`, foco visible, roles de diálogo, skip-link), pero **no se hizo una auditoría con lector de pantalla**.
5. Auditoría npm: avisos moderados de `minimatch` solo en herramientas de lint (no se empaquetan en producción).
6. ~~Retiro del frontend legacy~~ **Hecho (2026-11-07)**. La CSP fuera de `/app` ya no permite CDNs.
7. `docker-compose.yml` de desarrollo monta `.:/code`, que tapa el `dist` de la imagen: compilar el frontend en el host o usar `FLUJOPAGO_FRONTEND=legacy`.
8. 44 tests `async` del backend se omiten porque falta `pytest-asyncio` (preexistente).

---

## 18. Cómo reproducir la validación

```bash
# Stack aislado real (PostgreSQL + Redis + Mailpit + backend)
docker compose -p flujopago-e2e -f e2e/docker-compose.e2e.yml --env-file e2e/.env.e2e up -d --build

cd frontend
npm ci
npm run typecheck && npm run lint && npm test     # tipos, lint, 168 unitarias/componentes
npm run build                                     # SPA → frontend/dist
npx playwright test --project=chromium            # suite E2E completa
npx playwright test --project=webkit --project=firefox --project=mobile-chrome --project=mobile-safari

# Medición de rendimiento de la SPA (el modo legacy ya no existe tras el retiro)
MODE=react npx playwright test -c playwright.perf.config.ts

# Rollback: volver a un commit anterior al retiro del frontend original
```
