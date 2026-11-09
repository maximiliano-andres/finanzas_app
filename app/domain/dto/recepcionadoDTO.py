# schemas.py
from pydantic import BaseModel, ConfigDict
from datetime import datetime, date
from pydantic import Field

from enum import Enum

class EstadoSolicitud(str, Enum):
    rechazado = "RECHAZADO"
    esperando = "ESPERANDO"
    pendiente = "PENDIENTE"
    aprobado_N1 = "APROBADO NIVEL 1"
    aprobado_N2 = "APROBADO NIVEL 2"
    aprobado_Finanzas = "APROBADO FINANZAS"
    recepcionado = "RECEPCIONADO"
    pagado = "PAGADO"

class Meses_validos(str, Enum):
    enero = "ENERO"
    febrero = "FEBRERO"
    marzo = "MARZO"
    abril = "ABRIL"
    mayo = "MAYO"
    junio = "JUNIO"
    julio = "JULIO"
    agosto = "AGOSTO"
    septiembre = "SEPTIEMBRE"
    octubre = "OCTUBRE"
    noviembre = "NOVIEMBRE"
    diciembre = "DICIEMBRE" 

class Forma_Pago(str, Enum):
    deposito = "DEPOSITO"
    vale_vista = "VALE VISTA"
    deposito_y_vale_vista = "DEPOSITO Y VALE VISTA" 
    devolucion_vale_vista = "DEVOLUCION - VALE VISTA" 
    devolucion_deposito = "DEVOLUCION - DEPOSITO"

class Estado_solicitud(str, Enum):
    mis_solicitudes = "Mis Solicitudes"
    recepcionado = "Recepcionado"


# DTO para crear (input)
class RecepcionadoIn(BaseModel):
    usuario_id: int | None = Field(None, description="ID del usuario dueño de la solicitud")
    solicitante: str
    fecha_emision: date
    fecha_solicitud: date
    folio: str | list[str]
    empresa: str
    obra: str | None = None
    proceso: str
    monto: float = Field(ge=0, description="El monto debe ser mayor o igual a 0")
    estado: EstadoSolicitud = EstadoSolicitud.pendiente
    reviso: str
    mes_de_proceso: Meses_validos
    anio: int = Field(gt=2020, description="El año debe ser mayor a 2020") 
    cuenta_contable: str
    auxiliar: str
    fecha_de_pago: date
    unidad_de_negocio: str
    glosa: str | None = None
    observaciones: str | None = None
    observaciones_devolucion: str | None = None
    fecha_aprobacion: date | None = None
    modificacion_solicitud: bool | None = False
    
    # Campos para múltiples folios
    folio_uno: str | None = None
    monto_por_folio_uno: float | None = Field(None, ge=0)
    pdf_folio_uno: str | None = None
    forma_pago_folio_uno: Forma_Pago | None = None
    
    folio_dos: str | None = None
    monto_por_folio_dos: float | None = Field(None, ge=0)
    pdf_folio_dos: str | None = None
    forma_pago_folio_dos: Forma_Pago | None = None
    
    folio_tres: str | None = None
    monto_por_folio_tres: float | None = Field(None, ge=0)
    pdf_folio_tres: str | None = None
    forma_pago_folio_tres: Forma_Pago | None = None
    
    folio_cuatro: str | None = None
    monto_por_folio_cuatro: float | None = Field(None, ge=0)
    pdf_folio_cuatro: str | None = None
    forma_pago_folio_cuatro: Forma_Pago | None = None
    
    folio_cinco: str | None = None
    monto_por_folio_cinco: float | None = Field(None, ge=0)
    pdf_folio_cinco: str | None = None
    forma_pago_folio_cinco: Forma_Pago | None = None

    tipo_solicitud: Estado_solicitud = Estado_solicitud.mis_solicitudes

    pdf_firmado: str | None = None
    pdf_registro_autorizacion: str | None = None
    
    # Campo opcional para excluir la solicitud original durante la validación de duplicados
    id_solicitud_origen: int | None = None


# DTO para actualizar (patch/put)
class RecepcionadoUpdate(BaseModel):
    usuario_id: int | None = Field(None, description="ID del usuario dueño de la solicitud")
    solicitante: str | None = None
    fecha_solicitud: date | None = None
    folio: str | list[str] | None = None
    empresa: str | None = None
    obra: str | None = None
    proceso: str | None = None
    monto: float | None = None
    estado: EstadoSolicitud | None = None
    reviso: str | None = None
    mes_de_proceso: Meses_validos | None = None
    anio: int | None = None
    cuenta_contable: str | None = None
    auxiliar: str | None = None
    fecha_de_pago: date | None = None
    unidad_de_negocio: str | None = None
    glosa: str | None = None
    observaciones: str | None = None
    fecha_aprobacion: date | None = None
    modificacion_solicitud: bool | None = None

    # Campos para múltiples folios
    folio_uno: str | None = None
    monto_por_folio_uno: float | None = None
    pdf_folio_uno: str | None = None
    forma_pago_folio_uno: Forma_Pago | None = None
    
    folio_dos: str | None = None
    monto_por_folio_dos: float | None = None
    pdf_folio_dos: str | None = None
    forma_pago_folio_dos: Forma_Pago | None = None
    
    folio_tres: str | None = None
    monto_por_folio_tres: float | None = None
    pdf_folio_tres: str | None = None
    forma_pago_folio_tres: Forma_Pago | None = None
    
    folio_cuatro: str | None = None
    monto_por_folio_cuatro: float | None = None
    pdf_folio_cuatro: str | None = None
    forma_pago_folio_cuatro: Forma_Pago | None = None
    
    folio_cinco: str | None = None
    monto_por_folio_cinco: float | None = None
    pdf_folio_cinco: str | None = None
    forma_pago_folio_cinco: Forma_Pago | None = None

    tipo_solicitud: Estado_solicitud | None = None

    pdf_firmado: str | None = None
    pdf_registro_autorizacion: str | None = None

# DTO para devolver datos (output)
class RecepcionadoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario_id: int | None = None
    solicitante: str
    fecha_emision: date
    fecha_solicitud: date
    folio: str | list[str]
    empresa: str
    obra: str | None = None
    proceso: str
    monto: float
    estado: EstadoSolicitud
    reviso: str
    fecha_aprobacion: date | None = None
    mes_de_proceso: Meses_validos
    anio: int
    cuenta_contable: str
    auxiliar: str
    fecha_de_pago: date
    unidad_de_negocio: str
    glosa: str | None
    observaciones_devolucion: str | None
    modificacion_solicitud: bool | None = False
    
    # Campos para múltiples folios
    folio_uno: str | None = None
    monto_por_folio_uno: float | None = None
    pdf_folio_uno: str | None = None
    forma_pago_folio_uno: Forma_Pago | None = None
    
    folio_dos: str | None = None
    monto_por_folio_dos: float | None = None
    pdf_folio_dos: str | None = None
    forma_pago_folio_dos: Forma_Pago | None = None
    
    folio_tres: str | None = None
    monto_por_folio_tres: float | None = None
    pdf_folio_tres: str | None = None
    forma_pago_folio_tres: Forma_Pago | None = None
    
    folio_cuatro: str | None = None
    monto_por_folio_cuatro: float | None = None
    pdf_folio_cuatro: str | None = None
    forma_pago_folio_cuatro: Forma_Pago | None = None
    
    folio_cinco: str | None = None
    monto_por_folio_cinco: float | None = None
    pdf_folio_cinco: str | None = None
    forma_pago_folio_cinco: Forma_Pago | None = None

    tipo_solicitud: Estado_solicitud

    pdf_firmado: str | None = None
    pdf_registro_autorizacion: str | None = None