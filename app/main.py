from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno del archivo .env al inicio
load_dotenv()

from app.infrastructure.utils.logger_personalizado import setup_logger
from app.infrastructure.middleware.error_middleware import ErrorMiddleware
from app.infrastructure.middleware.response_middleware import ResponseWrapperMiddleware
from app.infrastructure.db.database import init_db, close_db
from app.infrastructure.db.db_seed import seed_data, desactivar_credenciales_de_prueba
from app.infrastructure.security.redis_service import init_redis, close_redis

# IMPORTACIÓN OBLIGATORIA PARA REGISTRAR MODELOS
from app.domain.models import tabla_empresas, tabla_procesos, tabla_roles, tabla_usuarios, tabla_procesos_auxiliares, tabla_usuarios_obras, tabla_todas_solicitudes, tabla_recepcionados, tabla_historico, tabla_dispositivos_confianza

from app.infrastructure.middleware.middelware_base_headers import SecurityHeadersMiddleware
from app.infrastructure.middleware.cors import CustomCORSMiddleware
# IMPORTAR EL ROUTER
from app.interfaces.api.routers.dashboard_routes import router as dashboard_router
from app.interfaces.api.routers.usuario_routes import router as usuario_router
from app.interfaces.api.routers.procesos_routes import router as procesos_router
from app.interfaces.api.routers.procesos_auxiliare_routes import router as procesos_auxiliare_router
from app.interfaces.api.routers.empresa_routes import router as empresa_router
from app.interfaces.api.routers.roles_routes import router as rol_router
from app.interfaces.api.routers.todas_solicitudes_routes import router as todas_solicitudes_router
from app.interfaces.api.routers.recepcionado_routes import router as recepcionado_router
from app.interfaces.api.routers.historico_routes import router as historico_router
from app.interfaces.api.routers.pdf_firmado_routes import router as pdf_firmado_router
from app.interfaces.api.routers.pdf_registro_autorizacion_routes import router as pdf_registro_autorizacion_router
from app.interfaces.api.routers.mfa_routes import router as mfa_router
from app.interfaces.api.routers.password_routes import router as password_router
from app.interfaces.api.routers.pdf_download_routes import router as pdf_download_router
from app.interfaces.api.routers.spa_routes import router as spa_router
from app.infrastructure.security.mfa_dependency import MFAMiddleware

logger = setup_logger("MAIN")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("=" * 50)
    logger.info("Aplicación iniciando".center(50))
    logger.info("=" * 50)
    await init_db()    # Crea tablas
    await seed_data()  # Inserta datos iniciales
    await desactivar_credenciales_de_prueba()  # Auditoría H-32: neutraliza cuentas de prueba con clave publicada
    await init_redis() # Inicia Redis
    logger.info("=" * 50)
    logger.info("Aplicación iniciada exitosamente".center(50))
    logger.info("=" * 50)
    
    yield
    
    # Shutdown
    logger.info("=" * 50)
    logger.info("Iniciando cierre de aplicación".center(50))
    logger.info("=" * 50)
    await close_redis()
    await close_db()
    logger.info("=" * 50)
    logger.info("Aplicación cerrada correctamente".center(50))
    logger.info("=" * 50)

# Configuración de la aplicación
app = FastAPI(
    title="FlujoPago - Sistema de Gestión de Pagos",
    description="""El desarrollo de FlujoPago, nuestro Sistema de Gestión de
                    Pagos, nace de la necesidad de simplificar y
                    transparentar la administración de solicitudes y
                    reportes financieros.""",
    version="1.0.0",
    # authors="Maximiliano", # Moved to contact info if needed, invalid in init
    # email="max@gmail.com",
    contact={
        "name": "Maximiliano",
        "email": "max@gmail.com"
    },
    license_info={
        "name": "Push HR",
    },
    raise_server_exceptions=False,
    root_path="",
    lifespan=lifespan
)


# Middlewares (el orden importa)
app.add_middleware(MFAMiddleware)
app.add_middleware(ResponseWrapperMiddleware)
app.add_middleware(ErrorMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CustomCORSMiddleware)

# Configuración de rutas y templates
BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / "interfaces" / "api" / "templates"
STATIC_DIR = BASE_DIR.parent / "public"

#logger.info(f"Directorio Base: {BASE_DIR}")
#logger.info(f"Directorio de Templates: {TEMPLATES_DIR}")
#logger.info(f"Directorio Estático: {STATIC_DIR}") 

# Inicializar templates
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Servir archivos estáticos (CSS, JS, etc.)
if STATIC_DIR.exists():
    app.mount("/public", StaticFiles(directory=str(STATIC_DIR)), name="public")

# Garantizar que las carpetas de PDFs existan al iniciar la aplicación
PDF_DIR = Path(__file__).parent.parent / "doc_pdf"
if not PDF_DIR.exists():
    PDF_DIR.mkdir(parents=True, exist_ok=True)

PDF_FIRMADOS_DIR = Path(__file__).parent.parent / "PDF_firmados"
if not PDF_FIRMADOS_DIR.exists():
    PDF_FIRMADOS_DIR.mkdir(parents=True, exist_ok=True)

PDF_AUTORIZACIONES_DIR = Path(__file__).parent.parent / "PDF_autorizaciones"
if not PDF_AUTORIZACIONES_DIR.exists():
    PDF_AUTORIZACIONES_DIR.mkdir(parents=True, exist_ok=True)

# NOTA: Las carpetas PDF ya NO se sirven como archivos estáticos públicos.
# El acceso está protegido por el router pdf_download_router (requiere JWT).


# ============================================
# INCLUIR TODAS LAS RUTAS DEL ROUTER
# ============================================
app.include_router(dashboard_router)
app.include_router(usuario_router)
app.include_router(procesos_router)
app.include_router(procesos_auxiliare_router)
app.include_router(empresa_router)
app.include_router(rol_router)
app.include_router(todas_solicitudes_router)
app.include_router(recepcionado_router)
app.include_router(historico_router)
app.include_router(pdf_firmado_router)
app.include_router(pdf_registro_autorizacion_router)
app.include_router(mfa_router)
app.include_router(password_router)
app.include_router(pdf_download_router)
app.include_router(spa_router)  # Frontend React (SPA) + GET /session



# El control de inicio y apagado ya se realiza mediante contextlib lifespan.
