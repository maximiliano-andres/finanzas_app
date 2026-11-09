"""
Servicio de Histórico de FlujoPago
Registra automáticamente cada cambio de estado de una solicitud en tabla_historico
Las fases registradas son: PENDIENTE, RECHAZADO, APROBADO NIVEL 1, APROBADO NIVEL 2, APROBADO FINANZAS, RECEPCIONADO
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert
from app.domain.models.tabla_historico import TablaHistorico
from app.domain.models.tabla_todas_solicitudes import Tabla_Todas_Solicitudes
from app.domain.models.tabla_recepcionados import Tabla_Recepcionados
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("HISTORICO_SERVICE")

# Estados que deben registrarse en histórico
ESTADOS_REGISTRABLES = {
    "PENDIENTE",
    "RECHAZADO",
    "APROBADO NIVEL 1",
    "APROBADO NIVEL 2",
    "APROBADO FINANZAS",
    "RECEPCIONADO",
    "PAGADO"
}


async def registrar_cambio_historico(
    id_solicitud: int,
    nuevo_estado: str,
    solicitud_data,
    session: AsyncSession
) -> tuple[bool, str | None]:
    """
    Registra automáticamente un cambio de estado en tabla_historico
    
    Args:
        id_solicitud: ID de la solicitud original
        nuevo_estado: El nuevo estado de la solicitud
        solicitud_data: Objeto con los datos completos de la solicitud
        session: Sesión de base de datos
        
    Returns:
        Tupla (éxito: bool, error: str | None)
    """
    
    # Solo registrar si el estado es registrable
    estado_upper = nuevo_estado.upper() if nuevo_estado else ""
    if estado_upper not in ESTADOS_REGISTRABLES:
        # No es un estado registrable, pero no es un error
        logger.debug(f"Estado '{nuevo_estado}' no está en lista registrable para solicitud {id_solicitud}")
        return True, None
    
    try:
        # Validar que tenemos datos
        if not solicitud_data:
            logger.error(f"No hay datos de solicitud para registrar histórico de id {id_solicitud}")
            return False, "Datos de solicitud inválidos"
        
        # Construir el registro de histórico con TODOS los datos
        historico_record = {
            "id_solicitud_origen": id_solicitud,
            "usuario_id": getattr(solicitud_data, "usuario_id", None),
            "solicitante": getattr(solicitud_data, "solicitante", ""),
            "fecha_emision": getattr(solicitud_data, "fecha_emision", None),
            "fecha_solicitud": getattr(solicitud_data, "fecha_solicitud", None),
            "empresa": getattr(solicitud_data, "empresa", ""),
            "obra": getattr(solicitud_data, "obra", ""),
            "proceso": getattr(solicitud_data, "proceso", ""),
            "monto": getattr(solicitud_data, "monto", 0),
            "estado": estado_upper,
            "reviso": getattr(solicitud_data, "reviso", ""),
            "fecha_aprobacion": getattr(solicitud_data, "fecha_aprobacion", None),
            "mes_de_proceso": getattr(solicitud_data, "mes_de_proceso", ""),
            "anio": getattr(solicitud_data, "anio", 0),
            "cuenta_contable": getattr(solicitud_data, "cuenta_contable", ""),
            "auxiliar": getattr(solicitud_data, "auxiliar", ""),
            "fecha_de_pago": getattr(solicitud_data, "fecha_de_pago", None),
            "unidad_de_negocio": getattr(solicitud_data, "unidad_de_negocio", ""),
            "glosa": getattr(solicitud_data, "glosa", None),
            "observaciones": getattr(solicitud_data, "observaciones", None),
            "observaciones_devolucion": getattr(solicitud_data, "observaciones_devolucion", None),
            # Folios
            "folio": getattr(solicitud_data, "folio", ""),
            "folio_uno": getattr(solicitud_data, "folio_uno", None),
            "monto_por_folio_uno": getattr(solicitud_data, "monto_por_folio_uno", None),
            "pdf_folio_uno": getattr(solicitud_data, "pdf_folio_uno", None),
            "forma_pago_folio_uno": getattr(solicitud_data, "forma_pago_folio_uno", None),
            "folio_dos": getattr(solicitud_data, "folio_dos", None),
            "monto_por_folio_dos": getattr(solicitud_data, "monto_por_folio_dos", None),
            "pdf_folio_dos": getattr(solicitud_data, "pdf_folio_dos", None),
            "forma_pago_folio_dos": getattr(solicitud_data, "forma_pago_folio_dos", None),
            "folio_tres": getattr(solicitud_data, "folio_tres", None),
            "monto_por_folio_tres": getattr(solicitud_data, "monto_por_folio_tres", None),
            "pdf_folio_tres": getattr(solicitud_data, "pdf_folio_tres", None),
            "forma_pago_folio_tres": getattr(solicitud_data, "forma_pago_folio_tres", None),
            "folio_cuatro": getattr(solicitud_data, "folio_cuatro", None),
            "monto_por_folio_cuatro": getattr(solicitud_data, "monto_por_folio_cuatro", None),
            "pdf_folio_cuatro": getattr(solicitud_data, "pdf_folio_cuatro", None),
            "forma_pago_folio_cuatro": getattr(solicitud_data, "forma_pago_folio_cuatro", None),
            "folio_cinco": getattr(solicitud_data, "folio_cinco", None),
            "monto_por_folio_cinco": getattr(solicitud_data, "monto_por_folio_cinco", None),
            "pdf_folio_cinco": getattr(solicitud_data, "pdf_folio_cinco", None),
            "forma_pago_folio_cinco": getattr(solicitud_data, "forma_pago_folio_cinco", None),
            "tipo_solicitud": getattr(solicitud_data, "tipo_solicitud", "Mis Solicitudes"),
            "pdf_firmado": getattr(solicitud_data, "pdf_firmado", None),
            "pdf_registro_autorizacion": getattr(solicitud_data, "pdf_registro_autorizacion", None),
        }
        
        # Insertar en tabla_historico
        stmt = insert(TablaHistorico).values(**historico_record)
        await session.execute(stmt)
        
        # No hacer commit aquí - dejar que el llamador maneje la transacción
        logger.info(f"Histórico registrado para solicitud {id_solicitud} con estado {estado_upper}")
        
        return True, None
        
    except Exception as e:
        error_msg = f"Error registrando histórico para solicitud {id_solicitud}: {str(e)}"
        logger.error(error_msg)
        return False, error_msg
