from sqlalchemy import Column, BigInteger, ForeignKey
from app.infrastructure.db.database import Base

class UsuariosObras(Base):
    __tablename__ = "usuarios_obras"

    usuario_id = Column(BigInteger, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    obra_id = Column(BigInteger, ForeignKey("procesos_auxiliares.id", ondelete="CASCADE"), primary_key=True)
