import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import date
from app.domain.models.tabla_recepcionados import Tabla_Recepcionados

@pytest.mark.asyncio
async def test_get_recepcionados_success(client, mock_db):
    # Mock para los resultados
    mock_result = MagicMock()
    # scalars() retorna un AsyncMock que al ser esperado retorna mock_result_scalars
    mock_result_scalars = MagicMock()
    mock_result_scalars.all.return_value = []
    mock_result.scalars.return_value = mock_result_scalars
    
    # paginate_query llama a session.execute()
    mock_db.execute = AsyncMock(return_value=mock_result)
    
    response = client.get("/flujopago/gestion-pagos/v1/recepcionado")
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)

@pytest.mark.asyncio
async def test_crear_recepcionado_success(client, mock_db):
    payload = {
        "solicitante": "Test",
        "email": "test@flujopago.cl",
        "fecha_emision": "2024-01-01",
        "fecha_solicitud": "2024-01-01",
        "folio": "F-100",
        "empresa": "Empresa 1",
        "obra": "Obra 1",
        "proceso": "Proceso 1",
        "monto": 5000.0,
        "estado": "RECEPCIONADO",
        "reviso": "Admin",
        "mes_de_proceso": "ENERO",
        "anio": 2024,
        "cuenta_contable": "C1",
        "auxiliar": "A1",
        "fecha_de_pago": "2024-01-01",
        "unidad_de_negocio": "U1",
        "tipo_solicitud": "Recepcionado"
    }
    
    with patch("app.interfaces.api.routers.recepcionado_routes.crear_recepcionado_service") as mock_service:
        mock_recep = MagicMock()
        mock_recep.id = 1
        mock_recep.solicitante = "test"
        mock_recep.fecha_emision = date.today()
        mock_recep.fecha_solicitud = date.today()
        mock_recep.folio = "F-100"
        mock_recep.empresa = "Empresa 1"
        mock_recep.obra = "Obra 1"
        mock_recep.proceso = "Proceso 1"
        mock_recep.monto = 5000.0
        mock_recep.estado = "RECEPCIONADO"
        mock_recep.reviso = "Admin"
        mock_recep.mes_de_proceso = "ENERO"
        mock_recep.anio = 2024
        mock_recep.cuenta_contable = "C1"
        mock_recep.auxiliar = "A1"
        mock_recep.fecha_de_pago = date.today()
        mock_recep.unidad_de_negocio = "U1"
        mock_recep.tipo_solicitud = "Recepcionado"
        
        # Opcionales como None
        mock_recep.fecha_aprobacion = None
        mock_recep.glosa = None
        mock_recep.observaciones = None
        mock_recep.observaciones_devolucion = None
        mock_recep.folio_uno = None
        mock_recep.pdf_folio_uno = None
        mock_recep.forma_pago_folio_uno = None
        mock_recep.folio_dos = None
        mock_recep.pdf_folio_dos = None
        mock_recep.forma_pago_folio_dos = None
        mock_recep.folio_tres = None
        mock_recep.pdf_folio_tres = None
        mock_recep.forma_pago_folio_tres = None
        mock_recep.folio_cuatro = None
        mock_recep.pdf_folio_cuatro = None
        mock_recep.forma_pago_folio_cuatro = None
        mock_recep.folio_cinco = None
        mock_recep.pdf_folio_cinco = None
        mock_recep.forma_pago_folio_cinco = None
        mock_recep.pdf_firmado = None
        mock_recep.pdf_registro_autorizacion = None
        
        mock_service.return_value = (mock_recep, None)
        
        response = client.post("/flujopago/gestion-pagos/v1/recepcionado", json=payload)
        assert response.status_code == 200

@pytest.mark.asyncio
async def test_guardar_recepcionado_como_solicitud_success(client, mock_db):
    update_data = {"monto": 6000}
    
    with patch("app.interfaces.api.routers.recepcionado_routes.convertir_recepcionado_a_solicitud") as mock_service:
        mock_service.return_value = (10, None) # ID de la nueva solicitud
        
        response = client.post("/flujopago/gestion-pagos/v1/recepcionado/1/guardar-como-solicitud", json=update_data)
        assert response.status_code == 200
        assert response.json()["data"]["nueva_solicitud_id"] == 10

@pytest.mark.asyncio
async def test_reenviar_recepcionado_success(client, mock_db):
    mock_recep = MagicMock()
    mock_recep.folio = "F-777"
    mock_db.get.return_value = mock_recep
    
    payload = {
        "solicitante": "Test",
        "folio": "F-777",
        "monto": 5000,
        "empresa": "E1",
        "obra": "O1",
        "proceso": "P1",
        "fecha_solicitud": "2024-01-01",
        "reviso": "Admin",
        "mes_de_proceso": "ENERO",
        "anio": 2024,
        "cuenta_contable": "C1",
        "auxiliar": "A1",
        "fecha_de_pago": "2024-01-01",
        "unidad_de_negocio": "U1"
    }
    
    with patch("app.interfaces.api.routers.recepcionado_routes.insert") as mock_insert:
        mock_exe_result = MagicMock()
        
        # El objeto que retorna scalar_one() debe ser un mock de la solicitud creada
        mock_solicitud = MagicMock()
        # Campos mínimos requeridos por Todas_SolicitudesOut
        mock_solicitud.id = 1
        mock_solicitud.solicitante = "Test"
        mock_solicitud.fecha_emision = date.today()
        mock_solicitud.fecha_solicitud = date.today()
        mock_solicitud.folio = "F-777"
        mock_solicitud.empresa = "E1"
        mock_solicitud.proceso = "P1"
        mock_solicitud.monto = 5000.0
        mock_solicitud.estado = "RECHAZADO"
        mock_solicitud.reviso = "Jefe de Recursos Humanos"
        mock_solicitud.mes_de_proceso = "ENERO"
        mock_solicitud.anio = 2024
        mock_solicitud.cuenta_contable = "C1"
        mock_solicitud.auxiliar = "A1"
        mock_solicitud.fecha_de_pago = date.today()
        mock_solicitud.unidad_de_negocio = "U1"
        mock_solicitud.obra = "O1"
        mock_solicitud.tipo_solicitud = "Recepcionado"
        
        # IMPORTANTE: Asegurar que campos opcionales sean None, no MagicMocks
        mock_solicitud.fecha_aprobacion = None
        mock_solicitud.glosa = None
        mock_solicitud.observaciones = None
        mock_solicitud.observaciones_devolucion = None
        mock_solicitud.folio_uno = None
        mock_solicitud.pdf_folio_uno = None
        mock_solicitud.forma_pago_folio_uno = None
        mock_solicitud.folio_dos = None
        mock_solicitud.pdf_folio_dos = None
        mock_solicitud.forma_pago_folio_dos = None
        mock_solicitud.folio_tres = None
        mock_solicitud.pdf_folio_tres = None
        mock_solicitud.forma_pago_folio_tres = None
        mock_solicitud.folio_cuatro = None
        mock_solicitud.pdf_folio_cuatro = None
        mock_solicitud.forma_pago_folio_cuatro = None
        mock_solicitud.folio_cinco = None
        mock_solicitud.pdf_folio_cinco = None
        mock_solicitud.forma_pago_folio_cinco = None
        mock_solicitud.pdf_firmado = None
        mock_solicitud.pdf_registro_autorizacion = None

        mock_exe_result.scalar_one.return_value = mock_solicitud
        mock_db.execute = AsyncMock(return_value=mock_exe_result)
        
        response = client.post("/flujopago/gestion-pagos/v1/recepcionado/1/reenviar", json=payload)
        assert response.status_code == 200
        mock_db.delete.assert_called_once()
