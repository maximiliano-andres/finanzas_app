from sqlalchemy import Column, BigInteger, String, ForeignKey, DateTime, Boolean, Text
from app.infrastructure.db.database import Base
from datetime import datetime
from sqlalchemy.orm import relationship

class Usuarios(Base):
    __tablename__ = "usuarios"

    id = Column(BigInteger, primary_key=True, index=True)
    cargo = Column(String(150), nullable=False, index=True)
    nombre_1 = Column(String(150), nullable=False, index=True)
    nombres_2 = Column(String(150), nullable=True)
    apellido_1 = Column(String(150), nullable=False, index=True)
    apellido_2 = Column(String(150), nullable=True)
    email = Column(String(150), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)
    rol_id = Column(BigInteger, ForeignKey("roles.id"), nullable=False)
    rut = Column(String(12), nullable=False, unique=True, index=True)
    
    # --- Campos 2FA y seguridad ---
    mfa_enabled = Column(Boolean, default=False, nullable=False, server_default="false")
    mfa_secret_encrypted = Column(Text, nullable=True)  # TOTP secret cifrado con Fernet
    mfa_backup_codes = Column(Text, nullable=True)       # JSON array de hashes bcrypt
    mfa_verified_at = Column(DateTime, nullable=True)    # Última verificación 2FA exitosa
    must_change_password = Column(Boolean, default=False, nullable=False, server_default="false")
    password_changed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    rol = relationship("Roles", lazy="joined")  # <-- esto es clave
    obras = relationship("ProcesosAuxiliares", secondary="usuarios_obras")
