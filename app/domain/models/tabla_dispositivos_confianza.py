from sqlalchemy import Column, BigInteger, String, ForeignKey, DateTime
from app.infrastructure.db.database import Base
from datetime import datetime

class DispositivosConfianza(Base):
    __tablename__ = "dispositivos_confianza"

    id = Column(BigInteger, primary_key=True, index=True)
    usuario_id = Column(BigInteger, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    device_token = Column(String(255), unique=True, nullable=False, index=True)
    device_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    last_used_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
