from sqlalchemy import Column, BigInteger, String, ForeignKey, DateTime, Date, Integer, Numeric, Boolean
from app.infrastructure.db.database import Base
from datetime import date

#esta tabla hace referencia a Recepcionados
class Tabla_Recepcionados(Base):
    __tablename__ = "tabla_recepcionados"

    id = Column(BigInteger, primary_key=True, index=True, unique=True)
    usuario_id = Column(BigInteger, ForeignKey("usuarios.id"), nullable=True, index=True)
    solicitante = Column(String(150), nullable=False, index=True)
    fecha_emision = Column(Date, nullable=False)
    fecha_solicitud = Column(Date, nullable=False)

    empresa = Column(String(150), nullable=False, index=True)
    obra = Column(String(255), nullable=False, index=True)
    proceso = Column(String(255), nullable=False, index=True)
    monto = Column(Numeric(18,2), nullable=False)
    estado = Column(String(50), nullable=False, index=True)
    reviso = Column(String(255), nullable=False)
    fecha_aprobacion = Column(Date, default=date.today)


    mes_de_proceso = Column(String(10), nullable=False, index=True)
    anio = Column(Integer, nullable=False, index=True)
    cuenta_contable = Column(String(255), nullable=False)
    auxiliar = Column(String(255), nullable=False)
    fecha_de_pago = Column(Date, index=True)
    unidad_de_negocio = Column(String(50), nullable=False)
    glosa = Column(String(50), nullable=True)
    observaciones = Column(String(500), nullable=True)
    observaciones_devolucion = Column(String(500), nullable=True)


    folio = Column(String(1000), nullable=False, index=True)  # Puede ser un string único o un JSON serializado de folios
    
    ## Detalle por folios (para visualización y búsqueda específica)
    folio_uno = Column(String(1000), nullable=True, index=True)
    monto_por_folio_uno = Column(Numeric(18,2), nullable=True)
    pdf_folio_uno = Column(String(1000), nullable=True)
    forma_pago_folio_uno = Column(String(50), nullable=True)

    folio_dos = Column(String(1000), nullable=True, index=True)  # Puede ser un string único o un JSON serializado de folios
    monto_por_folio_dos = Column(Numeric(18,2), nullable=True) # JSON string: [{"folio": "F1", "monto": 100}, ...]
    pdf_folio_dos = Column(String(1000), nullable=True) # Almacena rutas de PDFs (puede ser JSON string)
    forma_pago_folio_dos = Column(String(50), nullable=True)

    folio_tres = Column(String(1000), nullable=True, index=True)  # Puede ser un string único o un JSON serializado de folios
    monto_por_folio_tres = Column(Numeric(18,2), nullable=True) # JSON string: [{"folio": "F1", "monto": 100}, ...]
    pdf_folio_tres = Column(String(1000), nullable=True) # Almacena rutas de PDFs (puede ser JSON string)
    forma_pago_folio_tres = Column(String(50), nullable=True)

    folio_cuatro = Column(String(1000), nullable=True, index=True)  # Puede ser un string único o un JSON serializado de folios
    monto_por_folio_cuatro = Column(Numeric(18,2), nullable=True) # JSON string: [{"folio": "F1", "monto": 100}, ...]
    pdf_folio_cuatro = Column(String(1000), nullable=True) # Almacena rutas de PDFs (puede ser JSON string)
    forma_pago_folio_cuatro = Column(String(50), nullable=True)

    folio_cinco = Column(String(1000), nullable=True, index=True)  # Puede ser un string único o un JSON serializado de folios
    monto_por_folio_cinco = Column(Numeric(18,2), nullable=True) # JSON string: [{"folio": "F1", "monto": 100}, ...]
    pdf_folio_cinco = Column(String(1000), nullable=True) # Almacena rutas de PDFs (puede ser JSON string)    
    forma_pago_folio_cinco = Column(String(50), nullable=True)

    tipo_solicitud = Column(String(50), nullable=False, index=True)
    pdf_firmado = Column(String(1000), nullable=True)
    pdf_registro_autorizacion = Column(String(1000), nullable=True)

    # modificacion
    modificacion_solicitud = Column(Boolean, default=False, nullable=False)