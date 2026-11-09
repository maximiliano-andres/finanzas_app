from sqlalchemy import Column, BigInteger, String
from app.infrastructure.db.database import Base

class Roles(Base):
    __tablename__ = "roles"

    id = Column(BigInteger, primary_key=True, index=True)
    nombre = Column(String(50), nullable=False, unique=True)
