from sqlalchemy import Column, BigInteger, String
from app.infrastructure.db.database import Base

class ProcesosAuxiliares(Base):
    __tablename__ = "procesos_auxiliares"

    id = Column(BigInteger, primary_key=True, index=True)
    numero = Column(String(20), nullable=False)
    detalle = Column(String(150), nullable=False)
    auxiliar = Column(String(20))
    estado = Column(String(20), nullable=False)
