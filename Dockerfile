# Dockerfile
# ---------- Etapa 1: build del frontend React (SPA) ----------
FROM node:22-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Etapa 2: backend FastAPI ----------
FROM python:3.11-slim-bookworm

# Evita salida buffer
ENV PYTHONUNBUFFERED=1

# Optimización en compilación (opcional)
ENV CFLAGS="-O3"

# Dependencias para compilar extensiones y libpq
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    libffi-dev \
    libqpdf-dev \
    pkg-config \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Directorio base
WORKDIR /code

# Instalar uv (gestor de paquetes ultrarrápido escrito en Rust)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copiar requirements primero para cachear la capa de dependencias
COPY requirements.txt /code/requirements.txt
RUN uv pip install --system --no-cache -r /code/requirements.txt

# Copiar aplicación
COPY . /code

# Build del frontend React (servido por FastAPI en /flujopago/gestion-pagos/v1/app)
COPY --from=frontend /frontend/dist /code/frontend/dist

# Configurar un usuario no-root por seguridad
RUN useradd -m -s /bin/bash appuser && chown -R appuser:appuser /code
USER appuser

# Exponer puerto de Uvicorn
EXPOSE 8000

# Comando por defecto (sobreescribible en docker-compose)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
