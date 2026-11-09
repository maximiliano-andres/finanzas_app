# 🔄 Flujo Visual del Sistema de Seguridad

## Diagrama Completo del Flujo

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         FlujoPago SECURITY WORKFLOW                           │
│                      Sistema de Reportes v2.0                            │
└──────────────────────────────────────────────────────────────────────────┘

                        ┌─ TRIGGERS DE ACTIVACIÓN ─┐
                        │                          │
                  ┌─────┴──────┬──────────┬────────┴──────┐
                  │            │          │               │
                PUSH          PR       CRON (2AM)       MANUAL
            (main, etc)    (branches)    UTC         (workflow_dispatch)
                  │            │          │               │
                  └─────┬──────┴──────────┴───────────────┘
                        │
                        ↓
        ┌───────────────────────────────────┐
        │   JOB 0: Detect Changes           │
        │   ├─ Archivo: requirements*.txt?  │
        │   ├─ Archivo: pyproject.toml?     │
        │   └─ Archivos Python?             │
        └───────┬───────────────────────────┘
                │
        ┌───────┴──────────────────────────────────────────┐
        │                                                  │
        ↓                                                  ↓
┌───────────────────────┐                      ┌──────────────────────┐
│ deps = true           │                      │ deps = false         │
│ (actualizar deps)     │                      │ (sin cambios)        │
│                       │                      │                      │
│ EJECUTAR ANÁLISIS     │                      │ SKIPS JOBS 1-6       │
└───────────────────────┘                      │ SOLO METADATOS       │
        │                                      └──────────────────────┘
        │
┌───────┴──────────────────────────────────────────────────────────┐
│                     ANÁLISIS PARALELO                             │
│         (Todos se ejecutan simultáneamente)                       │
└───────┬──────┬──────────────┬──────────┬────────────┬─────────────┘
        │      │              │          │            │
        ↓      ↓              ↓          ↓            ↓
┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐
│ JOB 1    ││ JOB 2    ││ JOB 3    ││ JOB 4    ││ JOB 5    │
│ SAFETY   ││ PIP-AUDIT││ OUTDATED ││ LICENSES ││ SBOM     │
│          ││          ││          ││          ││          │
│ +────────┤│ +────────┤│ +────────┤│ +────────┤│ +────────┤
│ │Safety  ││ │pip-    ││ │pip list ││ │pip-    ││ │cyclone ││
│ │Check   ││ │audit   ││ │--outdated││ licenses││ │dx-bom  │
│ │        ││ │        ││ │        ││ │        ││ │        │
│ └────────┘│ └────────┘│ └────────┘│ └────────┘│ └────────┘
│ Salida:  ││ Salida:  ││ Salida:  ││ Salida:  ││ Salida:  │
│ - JSON   ││ - JSON   ││ - JSON   ││ - JSON   ││ - JSON   │
│ - TXT    ││ - MD     ││          ││          ││          │
└──────────┘└──────────┘└──────────┘└──────────┘└──────────┘
        │      │              │          │            │
        └──────┴──────────────┴──────────┴────────────┘
                        │
                        ↓
    ┌───────────────────────────────────┐
    │  Artifacts descargados            │
    │  ├─ safety-report.json            │
    │  ├─ safety-report.txt             │
    │  ├─ audit-report.json             │
    │  ├─ audit-report.md               │
    │  ├─ outdated.json                 │
    │  ├─ licenses.json                 │
    │  └─ sbom.json                     │
    └───────────────────────────────────┘
                        │
                        ↓
    ┌────────────────────────────────────────┐
    │   JOB 6: REPORT GENERATION (MAIN)      │
    │                                         │
    │  ┌─────────────────────────────────┐  │
    │  │ Descargar todos los artefactos  │  │
    │  └─────────────────────────────────┘  │
    │              ↓                        │
    │  ┌─────────────────────────────────┐  │
    │  │ Ejecutar generate_security_     │  │
    │  │ report.py                       │  │
    │  └─────────────────────────────────┘  │
    │              ↓                        │
    │  ┌─────────────────────────────────┐  │
    │  │ SecurityReportGenerator         │  │
    │  │  ├─ Cargar JSON reports         │  │
    │  │  ├─ Procesar pip-audit data     │  │
    │  │  ├─ Procesar Safety data        │  │
    │  │  ├─ Procesar paquetes desactual.  │
    │  │  ├─ Calcular CVSS → Severidad  │  │
    │  │  └─ Generar estadísticas       │  │
    │  └─────────────────────────────────┘  │
    │              ↓                        │
    │  ┌─────────────────────────────────┐  │
    │  │ ReportLab: Construir PDF        │  │
    │  │  ├─ Página de título            │  │
    │  │  ├─ Resumen ejecutivo           │  │
    │  │  ├─ Vulnerabilidades por pkg    │  │
    │  │  ├─ Paquetes desactualizados    │  │
    │  │  ├─ Recomendaciones             │  │
    │  │  └─ Footer                      │  │
    │  └─────────────────────────────────┘  │
    │              ↓                        │
    │  ┌─────────────────────────────────┐  │
    │  │ GitHub Checks Integration       │  │
    │  │  └─ Crear check run en PR       │  │
    │  └─────────────────────────────────┘  │
    └────────────────────────────────────────┘
                        │
                        ↓
    ┌────────────────────────────────────┐
    │   PDF REPORT GENERADO              │
    │                                     │
    │  📄 security-report-              │
    │     YYYYMMDD-HHMMSS.pdf            │
    │                                     │
    │  ✅ Tamaño: 2-5 MB                 │
    │  ✅ Páginas: 4-8                   │
    │  ✅ Información: Completa          │
    │  ✅ Profesional: Sí                │
    └────────────────────────────────────┘
                        │
                        ↓
    ┌────────────────────────────────────┐
    │   UPLOAD ARTIFACT                  │
    │   (retention: 90 days)              │
    └────────────────────────────────────┘
                        │
                        ↓
        ┌───────────────────────────────┐
        │  DISPONIBLE EN ARTIFACTS      │
        │  GitHub Actions → Artifacts   │
        │  comprehensive-security-      │
        │  report                       │
        └───────────────────────────────┘
                        │
                        ↓
        ┌───────────────────────────────────────────┐
        │   USUARIO DESCARGA PDF REPORT             │
        └───────────────────────────────────────────┘
                        │
        ┌───────────────┴──────────────────┐
        │                                  │
        ↓                                  ↓
┌─────────────────┐            ┌─────────────────┐
│  Analiza CRÍTICO│            │ Analiza ALTOS   │
│  (CVSS 9-10)    │            │ (CVSS 7-8.9)    │
│                 │            │                 │
│  ├─ Lee detalles│            │ ├─ Lee descrip. │
│  ├─ Identifica  │            │ ├─ Versión seg. │
│  │  paquete     │            │ ├─ Crea issue   │
│  ├─ Nota versión│            │ ├─ Etiqueta     │
│  │  segura      │            │ │  security-high│
│  ├─ HOTFIX      │            │ └─ Planifica    │
│  │  INMEDIATO   │            │    próximo sprint
│  └─ Despliega   │            └─────────────────┘
│     4h máximo   │
└─────────────────┘
        │
        └─────────────────────┬──────────────────────────┐
                              │                          │
        ┌─────────────────────┴────────────┐   ┌────────┴──────────┐
        │                                  │   │                  │
        ↓                                  ↓   ↓                  ↓
┌──────────────────┐          ┌──────────────────┐    ┌────────────────┐
│ Actualizar       │          │ Tests            │    │ MONITOREAR     │
│ requirements.txt │          │ (100% pasar)     │    │ MEDIOS/BAJOS   │
│                  │          │                  │    │                │
│ git commit       │          │ git commit       │    │ Incluir en     │
│ git push         │          │ git push         │    │ backlog        │
│ MERGE PR         │          │ MERGE PR         │    │ siguiente      │
│ inmediatamente   │          │ después review   │    │ sprint         │
└──────────────────┘          └──────────────────┘    └────────────────┘
        │                              │
        │                              ↓
        │                    ┌──────────────────┐
        │                    │ Deploy en próximo│
        │                    │ sprint (72h max) │
        │                    └──────────────────┘
        │
        ↓
┌────────────────────────────┐
│ DEPLOY INMEDIATO (4h)      │
│ - Actualizar servidor      │
│ - Monitorear sistema       │
│ - Reportar cierre          │
└────────────────────────────┘
```

---

## Procesamiento de Datos en Detalle

```
ENTRADA                    PROCESAMIENTO              SALIDA
─────────────────────────────────────────────────────────────

pip-audit JSON         ┌──────────────────┐      Vulnerabilidades
                       │ SecurityReport   │      Procesadas
                  ────→│ Generator        │────→  (Combinadas)
Safety JSON            │  .process_*()    │
                       └──────────────────┘
outdated.json                 │
                              ↓
                    ┌──────────────────┐
                    │ Clasificación    │
                    │ CVSS → Severidad │
                    │ (9-10→CRÍTICO)   │
                    │ (7-8.9→ALTO)     │
                    │ (4-6.9→MEDIO)    │
                    │ (0.1-3.9→BAJO)   │
                    └──────────────────┘
                              │
                              ↓
                    ┌──────────────────┐
                    │ Estadísticas     │
                    │ • Total          │
                    │ • Por severidad  │
                    │ • Por paquete    │
                    └──────────────────┘
                              │
                              ↓
                    ┌──────────────────┐
                    │ Construcción PDF │
                    │ con ReportLab    │
                    │ (Estilos corp.)  │
                    └──────────────────┘
                              │
                              ↓
                    PDF REPORT FINAL
                    (4-8 páginas)
```

---

## Integración con GitHub

```
┌────────────────────────────────────────┐
│     GitHub Push/PR Event               │
└────────────┬───────────────────────────┘
             │
             ↓
┌────────────────────────────────────────┐
│  GitHub Actions                        │
│  ├─ Workflow se dispara               │
│  ├─ Corre todos los jobs              │
│  ├─ Genera artefactos                 │
│  └─ Crea check run en PR              │
└────────────┬───────────────────────────┘
             │
             ├─────────────────────────────┐
             │                             │
             ↓                             ↓
     ┌──────────────┐           ┌──────────────────┐
     │ Artifacts    │           │ GitHub Checks    │
     │ disponibles  │           │ (PR Review)      │
     │ 90 días      │           │                  │
     └──────────────┘           │ "Security Audit" │
                                │ status: neutral  │
                                └──────────────────┘
             │
             ↓
     ┌──────────────┐
     │ Developer    │
     │ descargar    │
     │ PDF          │
     │ & analizar   │
     └──────────────┘
```

---

## Matriz de Severidad Visual

```
          10 ┌─────────────────────────────────┐
             │         🔴 CRÍTICO (9-10)       │
             │                                 │
           9 │  RCE, Auth Bypass               │
             │  HOTFIX INMEDIATO (4h)          │
             └─────────────────────────────────┘
          8.9┌─────────────────────────────────┐
             │       🟠 ALTO (7-8.9)           │
             │                                 │
           7 │  Denial of Service              │
             │  Próximo Sprint (72h)           │
             └─────────────────────────────────┘
          6.9┌─────────────────────────────────┐
             │      🟡 MEDIO (4-6.9)           │
             │                                 │
           4 │  Information Disclosure         │
             │  Evaluar (1-2 weeks)            │
             └─────────────────────────────────┘
          3.9┌─────────────────────────────────┐
             │      🟢 BAJO (0.1-3.9)          │
             │                                 │
           0.1│ Theoretical Vulnerability       │
             │  Monitorear (Flexible)          │
             └─────────────────────────────────┘
           0 ┌─────────────────────────────────┐
             │     ℹ️ INFORMACIÓN (0)          │
             │  Solo informativo               │
             └─────────────────────────────────┘
```

---

## Ciclo de Vida de una Vulnerabilidad

```
DESCUBIERTA                  REPORTADA                   REMEDIADA
┌──────────────┐           ┌──────────────┐           ┌──────────────┐
│              │           │              │           │              │
│ Workflow     │  T+0s     │ PDF          │  T+Xh     │ Sistema      │
│ ejecuta      │────────→  │ disponible   │────────→  │ actualizado  │
│ análisis     │           │ en Artifacts │           │ y deplorado  │
│              │           │              │           │              │
└──────────────┘           └──────────────┘           └──────────────┘
      │                            │                         │
      ├─ 5-10 min                  ├─ Leer reporte          ├─ Tests
      │                            │                        │
      ├─ Safe análisis             ├─ Analizar severity     ├─ Verificar
      │                            │                        │
      ├─ pip-audit analysis        ├─ Crear issue/fix      ├─ Monitor
      │                            │                        │
      └─ Build PDF                 └─ Comunicar al equipo   └─ Cerrar

CRITICIDAD vs TIEMPO
┌──────────────────────────────────────────────────────────┐
│                                                          │
│ CRÍTICO    [████████████ 4h TARGET TIEMPO MÁXIMO ███]   │
│                                                          │
│ ALTO       [████████████████████ 72h TARGET ██████]     │
│                                                          │
│ MEDIO      [████████████████████████████ 1-2w ████]     │
│                                                          │
│ BAJO       [═══════════════════════════════ FLEXIBLE]   │
│                                                          │
└──────────────────────────────────────────────────────────┘
      0h               24h              48h               72h+
```

---

## Estructura de Datos en Memoria

```
VULNERABILIDAD OBJECT
├─ package: "fastapi"
├─ current_version: "0.104.1"
├─ source: "pip-audit"
├─ vulnerability_id: "CVE-2024-12345"
├─ description: "Remote Code Execution..."
├─ cvss_score: 9.8
├─ severity: "CRÍTICO"        (Calculado)
├─ priority: 1                 (Para ordenar)
├─ fixed_versions: [
│   "0.104.2",
│   "0.105.0"
│ ]
└─ details: "Technical details..."

ESTADÍSTICAS
├─ total_vulnerabilities: 5
├─ critical: 2
├─ high: 1
├─ medium: 2
├─ low: 0
└─ unknown: 0

REPORTE PDF
├─ Página 1: Título
├─ Página 2: Resumen + Estadísticas
├─ Página 3-6: Vulnerabilidades por paquete
├─ Página 7: Paquetes desactualizados
├─ Página 8: Recomendaciones
└─ Página N: Footer
```

---

## Performance y Tiempos

```
OPERACIÓN                   TIEMPO TÍPICO
────────────────────────────────────────
Detect changes              < 1 minuto
Safety check                2-3 minutos
pip-audit check             2-3 minutos
Outdated analysis           1-2 minutos
Licenses analysis           1-2 minutos
SBOM generation             < 1 minuto
────────────────────────────────────────
Total análisis paralelo     ≈ 3-5 minutos

Report generation           < 2 minutos
PDF creation                < 1 minuto
Upload artifact             < 1 minuto
────────────────────────────────────────
TIEMPO TOTAL WORKFLOW       ≈ 5-10 minutos
```

---

## Escalabilidad

```
PEQUEÑO PROYECTO             PROYECTO MEDIANO        PROYECTO GRANDE
(10-20 dependencias)         (30-50 dependencias)    (100+ dependencias)

Vulnerabilidades            Vulnerabilidades        Vulnerabilidades
encontradas: 0-2            encontradas: 2-5        encontradas: 5-20

Tamaño PDF: 2-3 MB          Tamaño PDF: 3-5 MB      Tamaño PDF: 5-10 MB
Páginas: 4-5                Páginas: 5-7            Páginas: 8-15
Tiempo: 5 min               Tiempo: 7 min           Tiempo: 10 min

Facilidad análisis:         Necesita priorización:  Requiere proceso
Directo                     Por severidad           Bien definido
```

---

Última actualización: Febrero 2026
