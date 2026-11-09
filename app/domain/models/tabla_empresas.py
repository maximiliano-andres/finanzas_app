from sqlalchemy import Column, BigInteger, String
from app.infrastructure.db.database import Base

class Empresas(Base):
    __tablename__ = "empresas"

    id = Column(BigInteger, primary_key=True, index=True)
    empresa = Column(String(150), nullable=False ,unique=True)
    codigo = Column(String(20), nullable=False ,unique=True)
