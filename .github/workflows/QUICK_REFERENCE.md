# 🚨 Guía Rápida de Severidades - Quick Reference

## Matriz de Decisión

```
¿Qué severidad tiene mi vulnerabilidad?

                          CVSS Score
                            ↓
        ┌───────┬───────┬───────┬───────┬───────┐
        │ 0.0   │ 1-3.9 │ 4-6.9 │ 7-8.9 │ 9-10  │
        ├───────┼───────┼───────┼───────┼───────┤
        │INFO   │ BAJO  │ MEDIO │ ALTO  │CRÍTICO│
        │ℹ️    │ 🟢   │ 🟡   │ 🟠   │ 🔴   │
        └───────┴───────┴───────┴───────┴───────┘
             ↓       ↓       ↓       ↓       ↓
           INFO  MONITOREAR EVALUAR SPRINT HOTFIX
                              IMPACTO          INMEDIATO
```

---

## 🔴 CRÍTICO (CVSS 9.0-10.0)

```
🚨 ALERTA ROJA - ACCIÓN REQUERIDA INMEDIATAMENTE 🚨

┌─────────────────────────────────────────────────┐
│ ⏰ PLAZO: Máximo 4 horas                        │
│ 🎯 ACCIÓN: HOTFIX INMEDIATO                     │
│ 📞 NOTIFICAR: Equipo de seguridad + líderes     │
│ 🔓 RIESGO: Explotación remota probable         │
└─────────────────────────────────────────────────┘

PASOS:
1. git checkout -b hotfix/CVE-XXXX
2. pip install nombre_paquete==version_segura
3. pytest tests/ -v
4. git commit -m "🔒 HOTFIX: CVE-XXXX"
5. git push + PR inmediato
6. MERGE INMEDIATAMENTE
7. Desplegar
8. Monitorear sistema
9. Reportar cierre

EJEMPLOS:
- FastAPI RCE
- Django Remote Code Execution
- SQLAlchemy SQL Injection
- PyJWT Authentication Bypass
```

---

## 🟠 ALTO (CVSS 7.0-8.9)

```
⚠️ ALERTA NARANJA - PRÓXIMO SPRINT ⚠️

┌─────────────────────────────────────────────────┐
│ ⏰ PLAZO: Máximo 72 horas / Próximo sprint       │
│ 🎯 ACCIÓN: Planificar actualización             │
│ 📞 NOTIFICAR: Líderes técnicos                  │
│ 🔓 RIESGO: Explotación posible con acceso      │
└─────────────────────────────────────────────────┘

PASOS:
1. Crear issue en backlog
2. Etiqueta: "security-high"
3. Prioridad: Alta
4. Evaluar impacto de cambios
5. Evaluar versión target
6. Planificar para próximo sprint
7. Actualizar como parte de PR normal
8. Tests completos
9. Merge cuando esté listo
10. Desplegar en próxima versión

EJEMPLOS:
- Pydantic Validation Bypass
- FastAPI CORS Misconfiguration
- Uvicorn HTTP Request Smuggling
- JWT Token Validation Issues
```

---

## 🟡 MEDIO (CVSS 4.0-6.9)

```
ℹ️ ALERTA AMARILLA - PLANIFICAR ℹ️

┌─────────────────────────────────────────────────┐
│ ⏰ PLAZO: 1-2 semanas / Roadmap regular          │
│ 🎯 ACCIÓN: Evaluar actualización                │
│ 📞 NOTIFICAR: Equipo de desarrollo              │
│ 🔓 RIESGO: Explotación bajo condiciones         │
└─────────────────────────────────────────────────┘

PASOS:
1. Crear issue en backlog
2. Etiqueta: "security-medium"
3. Prioridad: Media
4. Revisar descripción técnica
5. Evaluar impacto en código
6. Verificar versión target
7. Incluir en siguiente iteración
8. Tests completos antes de merge
9. Deploy normal

EJEMPLOS:
- Denial of Service
- Information Disclosure
- Deserialization Issues
- Weak Cryptography Warnings
```

---

## 🟢 BAJO (CVSS 0.1-3.9)

```
✓ ALERTA VERDE - MONITOREAR ✓

┌─────────────────────────────────────────────────┐
│ ⏰ PLAZO: Flexible / Actualización regular       │
│ 🎯 ACCIÓN: Monitorear                           │
│ 📞 NOTIFICAR: Opcional                          │
│ 🔓 RIESGO: Explotación muy difícil              │
└─────────────────────────────────────────────────┘

PASOS:
1. Registrar en backlog (baja prioridad)
2. Etiqueta: "security-low"
3. Prioridad: Baja
4. No requiere acción inmediata
5. Actualizar durante mantenimiento regular
6. Agrupar con otras actualizaciones
7. Tests normales
8. Deploy normal

EJEMPLOS:
- Minor Information Leaks
- Non-critical Warnings
- Theoretical Vulnerabilities
- Documentation Issues
```

---

## ℹ️ INFORMACIÓN (CVSS 0.0)

```
ℹ️ INFORMACIÓN - SOLO REFERENCIA ℹ️

┌─────────────────────────────────────────────────┐
│ ⏰ PLAZO: N/A                                   │
│ 🎯 ACCIÓN: Solo informativo                     │
│ 📞 NOTIFICAR: No necesario                      │
│ 🔓 RIESGO: Ninguno                              │
└─────────────────────────────────────────────────┘

EJEMPLOS:
- Licencia de paquete
- Versión disponible más nueva
- Actualizaciones menores
- Cambios de seguridad menores
```

---

## 📱 Paquetes Desactualizados

```
📦 ACTUALIZAR CUANDO SEA CONVENIENTE 📦

┌─────────────────────────────────────────────────┐
│ ⏰ PLAZO: Flexible                              │
│ 🎯 ACCIÓN: Mantener actualizado                │
│ 📞 NOTIFICAR: No                                │
│ 🔓 RIESGO: Bajo (sin vulnerabilidades)          │
└─────────────────────────────────────────────────┘

BENEFICIOS DE ACTUALIZAR:
- Correcciones de bugs
- Mejoras de rendimiento
- Nuevas características
- Soporte extendido
- Seguridad preventiva

PASOS:
1. Revisar changelog
2. Verificar compatibilidad
3. Tests locales
4. Actualizar en PR
5. Deploy normal
```

---

## ⚡ Acciones Rápidas por Severidad

### 🔴 CRÍTICO
```bash
# EN ESTOS MOMENTOS
git checkout -b hotfix/$(date +%s)
pip install nombre==version_segura
pytest tests/
git add requirements.txt
git commit -m "🔒 HOTFIX: Vulnerabilidad crítica"
git push && crear-PR
# MERGE INMEDIATO
# DEPLOY INMEDIATO
```

### 🟠 ALTO
```bash
# PRÓXIMAS 72 HORAS
# 1. Crear issue
# 2. Etiqueta: security-high
# 3. Asignar a próximo sprint
# 4. Actualizar normalmente
# 5. Deploy con próxima versión
```

### 🟡 MEDIO
```bash
# PRÓXIMAS 1-2 SEMANAS
# 1. Crear issue con baja prioridad
# 2. Etiqueta: security-medium
# 3. Evaluar impacto
# 4. Actualizar cuando sea conveniente
# 5. Deploy normal
```

### 🟢 BAJO
```bash
# CUANDO SEA CONVENIENTE
# 1. Registrar en backlog
# 2. Etiqueta: security-low
# 3. Incluir en mantenimiento regular
# 4. Agrupar actualizaciones
# 5. Deploy normal
```

---

## 📊 Matriz de Decisión Detallada

```
SEVERIDAD │ CVSS  │ SLA   │ ACCIÓN              │ NOTIFICAR
──────────┼───────┼───────┼─────────────────────┼────────────
CRÍTICO   │ 9-10  │ 4h    │ HOTFIX INMEDIATO    │ TODOS
ALTO      │ 7-8.9 │ 72h   │ Siguiente sprint    │ Líderes
MEDIO     │ 4-6.9 │ 1-2w  │ Evaluar impact      │ Dev
BAJO      │ 0.1-4 │ Flex  │ Monitorear          │ Opcional
INFO      │ 0     │ N/A   │ Solo registrar      │ No
```

---

## 🎯 Palabras Clave para Buscar en Reporte

**Busca por CVSS score:**
- `9` o `10` = CRÍTICO (busca inmediatamente)
- `7` u `8` = ALTO (proximamente)
- `4`, `5`, `6` = MEDIO (planificar)
- `0`, `1`, `2`, `3` = BAJO (cuando puedas)

**Busca por paquete:**
- ¿Usamos FastAPI? Revisar CVEs en FastAPI
- ¿Usamos Pydantic? Revisar CVEs en Pydantic
- etc.

**Busca por versión:**
- Compara versión actual con segura en reporte
- Asegúrate de actualizar a versión segura

---

## ✅ Checklist de Acción Rápida

### Cuando recibas reporte CRÍTICO:
- [ ] Descargar PDF
- [ ] Revisar CVSS scores > 9.0
- [ ] Identificar paquete
- [ ] Crear branch hotfix
- [ ] Actualizar paquete
- [ ] Ejecutar tests
- [ ] Crear PR
- [ ] Revisar y mergear
- [ ] Desplegar inmediatamente
- [ ] Monitorear sistema
- [ ] Documentar en incident log

### Cuando recibas reporte ALTO:
- [ ] Descargar PDF
- [ ] Revisar CVSS 7.0-8.9
- [ ] Crear issue en backlog
- [ ] Etiquetar "security-high"
- [ ] Asignar a próximo sprint
- [ ] Notificar a líderes
- [ ] Planificar actualización
- [ ] Ejecutar cuando esté listo

### Cuando recibas reporte MEDIO:
- [ ] Descargar PDF
- [ ] Revisar CVSS 4.0-6.9
- [ ] Crear issue en backlog
- [ ] Etiquetar "security-medium"
- [ ] Evaluar impacto
- [ ] Planificar para futura actualización

### Cuando recibas reporte BAJO:
- [ ] Descargar PDF (para referencia)
- [ ] Revisar CVSS < 4.0
- [ ] Registrar si es necesario
- [ ] Actualizar cuando sea conveniente

---

## 📞 Escalación

```
CRÍTICO
  ↓
[Notificar Jefe de Seguridad]
[Notificar CTO]
[Notificar DevOps]
[Crear incident]
↓
HOTFIX INMEDIATO

ALTO
  ↓
[Notificar Team Lead]
[Crear issue en sprint]
↓
Próximo sprint

MEDIO
  ↓
[Crear issue normal]
↓
Cuando sea conveniente

BAJO
  ↓
[Registrar en backlog]
↓
Actualización normal
```

---

## 📈 Seguimiento

Para cada vulnerabilidad:
1. Documentar en tracking
2. Crear PR/issue
3. Asignar responsable
4. Establecer deadline según SLA
5. Actualizar cuando esté lista
6. Cerrar issue cuando se despliegue
7. Mantener registro histórico

---

**Imprime esta página para referencia rápida en escritorio**

Última actualización: Febrero 2026
