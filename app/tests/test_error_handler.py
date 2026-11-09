"""
Tests para validar el sistema centralizado de manejo de errores.
Ejecuta estos tests para asegurar que todo funciona correctamente.

Instala pytest primero:
    pip install pytest pytest-asyncio httpx
"""

import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys

# Agregar el directorio app al path
sys.path.insert(0, str(Path(__file__).parent / "app"))

from main import app
from infrastructure.middleware.error_handler import ErrorHandler, ErrorCode


# ============================================================================
# TESTS DE CONFIGURACIÓN
# ============================================================================

class TestErrorHandlerConfiguration:
    """Verifica que el ErrorHandler está configurado correctamente"""
    
    def test_error_codes_defined(self):
        """Verifica que todos los códigos de error están definidos"""
        assert ErrorCode.NOT_FOUND == 404
        assert ErrorCode.FORBIDDEN == 403
        assert ErrorCode.UNPROCESSABLE_ENTITY == 422
        assert ErrorCode.INTERNAL_SERVER_ERROR == 500
    
    def test_error_mappings_exists(self):
        """Verifica que todos los códigos están mapeados"""
        assert 404 in ErrorHandler.ERROR_MAPPINGS
        assert 403 in ErrorHandler.ERROR_MAPPINGS
        assert 422 in ErrorHandler.ERROR_MAPPINGS
        assert 500 in ErrorHandler.ERROR_MAPPINGS
    
    def test_templates_configured(self):
        """Verifica que los templates están configurados"""
        for status_code, config in ErrorHandler.ERROR_MAPPINGS.items():
            assert config.template.endswith(".html")
            assert config.title
            assert config.description


# ============================================================================
# TESTS DE DETECCIÓN DE ERRORES
# ============================================================================

class TestErrorDetection:
    """Verifica la detección automática de códigos de error"""
    
    def test_detect_value_error(self):
        """ValueError debe mapear a 422"""
        exc = ValueError("Datos inválidos")
        code = ErrorHandler.detect_error_code_from_exception(exc)
        assert code == 422
    
    def test_detect_permission_error(self):
        """PermissionError debe mapear a 403"""
        exc = PermissionError("Sin permiso")
        code = ErrorHandler.detect_error_code_from_exception(exc)
        assert code == 403
    
    def test_detect_file_not_found_error(self):
        """FileNotFoundError debe mapear a 404"""
        exc = FileNotFoundError("No existe")
        code = ErrorHandler.detect_error_code_from_exception(exc)
        assert code == 404
    
    def test_detect_by_keyword_not_found(self):
        """Excepción con 'no existe' debe mapear a 404"""
        exc = RuntimeError("La galería no existe en el sistema")
        code = ErrorHandler.detect_error_code_from_exception(exc)
        assert code == 404
    
    def test_detect_by_keyword_duplicate(self):
        """Excepción con 'duplicado' debe mapear a 422"""
        exc = RuntimeError("Email duplicado en base de datos")
        code = ErrorHandler.detect_error_code_from_exception(exc)
        assert code == 422
    
    def test_detect_by_keyword_permission(self):
        """Excepción con 'permisos' debe mapear a 403"""
        exc = RuntimeError("Permisos insuficientes para acceder")
        code = ErrorHandler.detect_error_code_from_exception(exc)
        assert code == 403
    
    def test_detect_unknown_error_defaults_to_500(self):
        """Excepción desconocida debe mapear a 500"""
        exc = RuntimeError("Error aleatorio sin palabras clave")
        code = ErrorHandler.detect_error_code_from_exception(exc)
        assert code == 500


# ============================================================================
# TESTS DE MAPEO DE TEMPLATES
# ============================================================================

class TestTemplateMapping:
    """Verifica el mapeo de códigos a templates"""
    
    def test_404_maps_to_error_404_html(self):
        """404 debe mapear a error_404.html"""
        template = ErrorHandler.get_template_for_status(404)
        assert template == "error_404.html"
    
    def test_403_maps_to_error_403_html(self):
        """403 debe mapear a error_403.html"""
        template = ErrorHandler.get_template_for_status(403)
        assert template == "error_403.html"
    
    def test_422_maps_to_error_422_html(self):
        """422 debe mapear a error_422.html"""
        template = ErrorHandler.get_template_for_status(422)
        assert template == "error_422.html"
    
    def test_500_maps_to_error_500_html(self):
        """500 debe mapear a error_500.html"""
        template = ErrorHandler.get_template_for_status(500)
        assert template == "error_500.html"
    
    def test_unknown_status_defaults_to_500_html(self):
        """Código desconocido debe mapear a error_500.html"""
        template = ErrorHandler.get_template_for_status(999)
        assert template == "error_500.html"


# ============================================================================
# TESTS DE INTEGRACIÓN HTTP
# ============================================================================

class TestHTTPErrorResponses:
    """Verifica las respuestas HTTP del middleware"""
    
    def test_home_page_returns_200(self, client):
        """GET / debe retornar 200"""
        response = client.get("/flujopago/gestion-pagos/v1/")
        assert response.status_code == 200
    
    def test_dashboard_returns_200(self, client):
        """GET /flujopago/gestion-pagos/v1/dashboard debe retornar 200"""
        response = client.get("/flujopago/gestion-pagos/v1/dashboard")
        assert response.status_code == 200
    
    def test_nonexistent_route_returns_404(self, client):
        """GET /ruta-inexistente debe retornar 404"""
        response = client.get("/ruta-inexistente-aleatoria")
        assert response.status_code == 404
    
    def test_404_response_is_html(self, client):
        """Error 404 debe retornar HTML"""
        response = client.get("/ruta-inexistente")
        assert response.status_code == 404
        assert "text/html" in response.headers.get("content-type", "")


# ============================================================================
# TESTS DE ERROR INFO
# ============================================================================

class TestErrorInfo:
    """Verifica la obtención de información de errores"""
    
    def test_get_error_info_for_404(self):
        """Debe obtener info correcta para 404"""
        config = ErrorHandler.get_error_config(404)
        assert config is not None
        assert config.status_code == 404
        assert config.template == "error_404.html"
        assert "Galería" in config.title
    
    def test_get_error_info_for_403(self):
        """Debe obtener info correcta para 403"""
        config = ErrorHandler.get_error_config(403)
        assert config is not None
        assert config.status_code == 403
        assert config.template == "error_403.html"
    
    def test_get_error_info_for_422(self):
        """Debe obtener info correcta para 422"""
        config = ErrorHandler.get_error_config(422)
        assert config is not None
        assert config.status_code == 422
        assert config.template == "error_422.html"
    
    def test_get_error_info_for_500(self):
        """Debe obtener info correcta para 500"""
        config = ErrorHandler.get_error_config(500)
        assert config is not None
        assert config.status_code == 500
        assert config.template == "error_500.html"
    
    def test_unknown_error_returns_none(self):
        """Código desconocido debe retornar None"""
        config = ErrorHandler.get_error_config(999)
        assert config is None


# ============================================================================
# INSTRUCCIONES DE EJECUCIÓN
# ============================================================================

"""
CÓMO EJECUTAR LOS TESTS:

1. Instalar dependencias:
   pip install pytest pytest-asyncio httpx

2. Ejecutar todos los tests:
   pytest app/tests/test_error_handler.py -v

3. Ejecutar un test específico:
   pytest app/tests/test_error_handler.py::TestErrorDetection::test_detect_value_error -v

4. Ejecutar con cobertura:
   pytest app/tests/test_error_handler.py --cov=app.infrastructure.middleware --cov-report=html

5. Ver reporte HTML:
   open htmlcov/index.html

COBERTURA ESPERADA:
- error_handler.py: 100% ✨
- error_middleware.py: 80%+ 
- main.py: 80%+

TESTS POR CATEGORÍA:

✅ Configuración (3 tests)
   - Códigos definidos
   - Mappings configurados
   - Templates registrados

✅ Detección (7 tests)
   - Por tipo de excepción
   - Por palabras clave
   - Fallback a 500

✅ Mapeo (5 tests)
   - Template correcto por código
   - Manejo de códigos desconocidos

✅ HTTP (4 tests)
   - Respuestas correctas
   - Content-type correcto

✅ Info (5 tests)
   - Información de errores
   - Manejo de códigos desconocidos

RESULTADO ESPERADO:
========================
24 passed in 0.15s ✨
========================
"""
