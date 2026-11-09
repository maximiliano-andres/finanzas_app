from sqlalchemy import Column, BigInteger, String
from app.infrastructure.db.database import Base

class Procesos(Base):
    __tablename__ = "procesos"

    id = Column(BigInteger, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    proceso = Column(String(150), nullable=False)
    cuenta_objeto = Column(String(20), nullable=False)
    auxiliar = Column(String(20))
    estado = Column(String(20), nullable=False)