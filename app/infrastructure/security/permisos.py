"""
Reglas de autorización a nivel de registro (auditoría de endpoints, nov-2026).

Este módulo NO introduce roles ni reglas nuevas: centraliza las reglas que ya existían dispersas en
las rutas (listas de roles/cargos de alta visibilidad, propiedad por usuario_id o nombre y las
transiciones de estado que el frontend ejecuta) para aplicarlas también en los endpoints que las
omitían (IDOR / escalamiento en el flujo de aprobación).
"""
from typing import Dict, Optional, Tuple

# Mismas listas usadas por GET /todas_solicitudes, /recepcionado y /historico.
ROLES_ALTA_VISIBILIDAD = {"Administrador", "Supervisor", "Responsable Finanzas"}
CARGOS_ALTA_VISIBILIDAD = {"Jefe de Recursos Humanos", "Subgerente de Capital Humano", "Jefe de Finanzas"}

# Misma lista usada por PATCH /todas_solicitudes para omitir el control de propiedad.
ROLES_GESTION_SOLICITUDES = {"Administrador", "Supervisor", "Responsable Finanzas", "Aprobador"}
CARGOS_GESTION_SOLICITUDES = {"Jefe de Finanzas"}

# Misma lista usada por POST /todas_solicitudes para omitir el control de obra.
ROLES_CREACION_LIBRE = {"Administrador", "Supervisor", "Responsable Finanzas"}
CARGOS_CREACION_LIBRE = {"Jefe de Finanzas", "Jefe de Recursos Humanos"}

# Pantalla Finanzas del frontend (única que recepciona): Administrador o Finanzas.
ROLES_RECEPCION = {"Administrador", "Supervisor", "Responsable Finanzas"}
CARGOS_RECEPCION = {"Jefe de Finanzas"}

# Estados que un solicitante puede asignar al crear (el frontend crea en ESPERANDO; PENDIENTE = enviar).
ESTADOS_INICIALES_SOLICITANTE = {"ESPERANDO", "PENDIENTE"}


def _rol(user: Dict) -> Optional[str]:
    return user.get("rol_nombre")


def _cargo(user: Dict) -> Optional[str]:
    return user.get("cargo")


def nombres_usuario(user: Dict) -> Tuple[str, str]:
    """Nombre completo (formato exacto con posibles dobles espacios) y normalizado, igual que los listados."""
    partes = [user.get("primer_nombre", ""), user.get("segundo_nombre", ""),
              user.get("primer_apellido", ""), user.get("segundo_apellido", "")]
    completo = " ".join(str(p) if p else "" for p in partes).strip()
    # AUDITORÍA: el código original hacía str(p) ANTES de filtrar, generando "ana None perez None" cuando
    # faltaba un segundo nombre/apellido; el fallback normalizado nunca coincidía.
    normalizado = " ".join(str(p) for p in partes if p).strip()
    return completo, normalizado


def _norm(texto) -> str:
    return " ".join(str(texto or "").split()).lower()


def coincide_nombre(user: Dict, solicitante) -> bool:
    """El texto `solicitante` corresponde al nombre del usuario (sin distinguir mayúsculas ni espacios)."""
    _, normalizado = nombres_usuario(user)
    return bool(normalizado) and _norm(solicitante) == _norm(normalizado)


def es_dueno(user: Dict, registro) -> bool:
    """Propiedad por usuario_id o por nombre completo (regla existente de retrocompatibilidad)."""
    if registro is None:
        return False
    if registro.usuario_id is not None and str(registro.usuario_id) == str(user.get("sub")):
        return True
    completo, normalizado = nombres_usuario(user)
    return bool(registro.solicitante) and registro.solicitante in {completo, normalizado} - {""}


async def es_dueno_verificado(session, user: Dict, registro) -> bool:
    """
    AUDITORÍA H-06: como `es_dueno`, pero la coincidencia por NOMBRE no otorga propiedad cuando el registro
    pertenece (usuario_id) a OTRA persona cuyo nombre es el mismo (homónimo). La coincidencia por nombre se
    conserva para registros heredados sin usuario_id o cargados por un tercero (p.ej. recepcionados antiguos
    que quedaron a nombre de Finanzas), que es el motivo por el que existe esta regla.
    """
    if registro is None:
        return False
    if registro.usuario_id is not None and str(registro.usuario_id) == str(user.get("sub")):
        return True
    if not es_dueno(user, registro):
        return False
    if registro.usuario_id is None:
        return True
    from app.domain.models.tabla_usuarios import Usuarios
    autor = await session.get(Usuarios, registro.usuario_id)
    if autor is None:
        return True
    nombre_autor = " ".join(filter(None, [autor.nombre_1, autor.nombres_2, autor.apellido_1, autor.apellido_2]))
    return _norm(nombre_autor) != _norm(registro.solicitante)


def condicion_propiedad(modelo, user: Dict):
    """
    Versión SQL de `es_dueno_verificado` para los listados: propio por usuario_id, o por nombre salvo que el
    usuario_id del registro sea de un homónimo (otra persona con ese mismo nombre).
    """
    from sqlalchemy import and_, exists, func, not_, or_, select
    from app.domain.models.tabla_usuarios import Usuarios

    completo, normalizado = nombres_usuario(user)
    sql_norm = lambda expr: func.lower(func.regexp_replace(func.trim(expr), r"\s+", " ", "g"))
    nombre_autor = func.concat_ws(" ", Usuarios.nombre_1, Usuarios.nombres_2, Usuarios.apellido_1, Usuarios.apellido_2)
    es_homonimo = exists(select(Usuarios.id).where(
        Usuarios.id == modelo.usuario_id, sql_norm(nombre_autor) == sql_norm(modelo.solicitante)
    ))
    return or_(
        modelo.usuario_id == int(user.get("sub")),
        and_(modelo.solicitante.in_([completo, normalizado]), or_(modelo.usuario_id.is_(None), not_(es_homonimo))),
    )


def es_alta_visibilidad(user: Dict) -> bool:
    return _rol(user) in ROLES_ALTA_VISIBILIDAD or _cargo(user) in CARGOS_ALTA_VISIBILIDAD


def gestiona_solicitudes(user: Dict) -> bool:
    return _rol(user) in ROLES_GESTION_SOLICITUDES or _cargo(user) in CARGOS_GESTION_SOLICITUDES


def crea_sin_restriccion(user: Dict) -> bool:
    return _rol(user) in ROLES_CREACION_LIBRE or _cargo(user) in CARGOS_CREACION_LIBRE


def puede_recepcionar(user: Dict) -> bool:
    return _rol(user) in ROLES_RECEPCION or _cargo(user) in CARGOS_RECEPCION


async def puede_modificar_solicitud(session, user: Dict, solicitud) -> bool:
    """Misma regla que PATCH /todas_solicitudes: gestores del flujo o dueño del registro."""
    return gestiona_solicitudes(user) or await es_dueno_verificado(session, user, solicitud)


async def puede_gestionar_recepcionado(session, user: Dict, recepcionado) -> bool:
    """Quien puede VER el recepcionado sin filtros (alta visibilidad) o su dueño."""
    return es_alta_visibilidad(user) or await es_dueno_verificado(session, user, recepcionado)


def puede_gestionar_documentos_flujo(user: Dict) -> bool:
    """PDF firmado / registro de autorización: pantallas de Aprobaciones y Finanzas (no Solicitante)."""
    return gestiona_solicitudes(user) or es_alta_visibilidad(user)


def transicion_permitida_para_dueno(solicitud, destino: str) -> bool:
    """
    Transiciones de estado que el DUEÑO (sin rol de gestión) ejecuta desde el frontend:
      - Enviar a aprobación / reenviar: → PENDIENTE (o volver a ESPERANDO).
      - "Modificar y reenviar" (editTransition) cuando un aprobador devolvió la solicitud para
        modificación (modificacion_solicitud = true): PENDIENTE → APROBADO NIVEL 1 y
        APROBADO NIVEL 1 → APROBADO NIVEL 2; y para tipo "Recepcionado" en PENDIENTE → APROBADO NIVEL 1.
    Cualquier otro estado (aprobaciones, RECHAZADO, APROBADO FINANZAS, RECEPCIONADO, PAGADO) es exclusivo
    de los roles del flujo.
    """
    actual = (solicitud.estado or "").upper()
    destino = (destino or "").upper()
    if destino == actual or destino in ESTADOS_INICIALES_SOLICITANTE:
        return True
    devuelta = bool(solicitud.modificacion_solicitud)
    if actual == "PENDIENTE" and destino == "APROBADO NIVEL 1":
        return devuelta or solicitud.tipo_solicitud == "Recepcionado"
    if actual == "APROBADO NIVEL 1" and destino == "APROBADO NIVEL 2":
        return devuelta
    return False
