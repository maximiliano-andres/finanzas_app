
import asyncio
from unittest.mock import MagicMock, AsyncMock
from fastapi import Request
from starlette.responses import JSONResponse
import json

# mock requirements
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from app.infrastructure.middleware.error_middleware import ErrorMiddleware
from app.infrastructure.middleware.error_handler import ErrorHandler

async def test_error_masking():
    print("Iniciando prueba de enmascaramiento de errores...")
    
    # Mock de Request
    mock_request = MagicMock(spec=Request)
    mock_request.url.path = "/flujopago/gestion-pagos/v1/test"
    mock_request.method = "GET"
    
    # Mock del siguiente middleware que lanza una excepción interna
    async def mock_call_next(request):
        raise Exception("DETALLE INTERNO SENSIBLE: Error en la tabla 'usuarios' cerca de 'DROP TABLE'...")

    middleware = ErrorMiddleware(app=None)
    
    # Ejecutar dispatch
    try:
        response = await middleware.dispatch(mock_request, mock_call_next)
        
        if isinstance(response, JSONResponse):
            content = json.loads(response.body.decode())
            message = content.get("message", "")
            
            print(f"Respuesta recibida (Status {response.status_code}): {message}")
            
            # Verificar que NO contiene el detalle interno
            if "DETALLE INTERNO SENSIBLE" in message:
                print("❌ ERROR: El detalle interno se está filtrando en la respuesta de la API.")
            else:
                print("✅ ÉXITO: El detalle interno ha sido enmascarado.")
                print(f"Mensaje seguro mostrado: {message}")
        else:
            print(f"❌ ERROR: La respuesta no es un JSONResponse. Tipo: {type(response)}")
            
    except Exception as e:
        print(f"❌ ERROR durante la ejecución del test: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_error_masking())
