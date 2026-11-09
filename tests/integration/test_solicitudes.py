"""
Solicitudes activas:
  GET/POST /todas_solicitudes, PATCH/DELETE /todas_solicitudes/{id},
  POST/DELETE /todas_solicitudes/{id}/pdf
Incluye flujo de estados (workflow), aislamiento por usuario/obra, persistencia real, archivos y concurrencia.
"""
import asyncio
from datetime import date, timedelta
from pathlib import Path

import pytest

from tests.integration.conftest import API, ROOT, TEST_DATABASE_URL, data_of, make_pdf_bytes, message_of

HOY = date.today()


def form(**kw):
    base = {
        "solicitante": "ana perez", "fecha_solicitud": HOY.isoformat(), "folio": ["F-1", "F-2"],
        "montos_por_folio": ["600", "400"], "empresa": "ANDES", "obra": "OBRA NORTE", "proceso": "REMUNERACIONES",
        "monto": "1000", "reviso": "Jefe de Recursos Humanos", "mes_de_proceso": "NOVIEMBRE", "anio": "2026",
        "cuenta_contable": "211310", "auxiliar": "0010", "fecha_de_pago": (HOY + timedelta(days=10)).isoformat(),
        "unidad_de_negocio": "UNE-1", "glosa": "glosa", "estado": "ESPERANDO", "forma_pago": ["DEPOSITO", "VALE VISTA"],
    }
    base.update(kw)
    return base


def pdf_file(name="F-1_respaldo.pdf", content=None, ctype="application/pdf"):
    return ("pdfs", (name, content if content is not None else make_pdf_bytes(), ctype))


def doc_pdf_files():
    d = ROOT / "doc_pdf"
    return {p.name for p in d.iterdir()} if d.exists() else set()


def crear(client, headers, files=None, **kw):
    return client.post(f"{API}/todas_solicitudes", data=form(**kw), files=files or [], headers=headers)


# ====================================================================== POST
class TestCrear:
    def test_persiste_folios_montos_pdf_y_autor(self, client, h, users, db):
        r = crear(client, h["ana"], files=[pdf_file()])
        assert r.status_code == 200, r.text
        row = db.one("SELECT * FROM tabla_todas_solicitudes")
        assert row["usuario_id"] == users["ana"].id
        assert float(row["monto"]) == 1000.0                       # suma de montos por folio
        assert row["folio"] == '["F-1","F-2"]' and row["folio_dos"] == "F-2"
        assert float(row["monto_por_folio_uno"]) == 600 and row["forma_pago_folio_dos"] == "VALE VISTA"
        assert row["estado"] == "ESPERANDO" and row["tipo_solicitud"] == "Mis Solicitudes"
        assert row["fecha_emision"] == HOY
        assert row["pdf_folio_uno"] and (ROOT / row["pdf_folio_uno"]).is_file()
        assert row["pdf_folio_dos"] is None

    def test_fecha_emision_por_defecto_se_evalua_en_cada_insercion(self):
        """HALLAZGO H-14: default=date.today() se evaluaba al importar el módulo (fecha congelada al arranque)."""
        from app.domain.models.tabla_todas_solicitudes import Tabla_Todas_Solicitudes
        default = Tabla_Todas_Solicitudes.__table__.c.fecha_emision.default
        assert default.is_callable

    @pytest.mark.parametrize("quien,obra", [("ana", "OBRA SUR"), ("sinobra", "OBRA NORTE"), ("beto", "OBRA NORTE")])
    def test_obra_no_asignada_403_sin_datos_ni_archivos(self, client, h, db, quien, obra):
        antes = doc_pdf_files()
        r = crear(client, h[quien], files=[pdf_file()], obra=obra)
        assert r.status_code == 403
        assert db.count("tabla_todas_solicitudes") == 0
        assert doc_pdf_files() == antes

    def test_folio_existente_de_otro_solicitante_400(self, client, h, users, db):
        db.insert_solicitud(usuario_id=users["beto"].id, solicitante="beto rojas", obra="OBRA SUR", folio="F-2", folio_uno="F-2")
        r = crear(client, h["ana"])
        assert r.status_code == 400 and "F-2" in message_of(r)
        assert db.count("tabla_todas_solicitudes") == 1

    def test_rechazo_no_deja_pdfs_huerfanos(self, client, h, users, db):
        """HALLAZGO H-18: los PDFs se guardaban ANTES de validar folios; un 400 dejaba archivos huérfanos."""
        db.insert_solicitud(usuario_id=users["beto"].id, solicitante="beto rojas", obra="OBRA SUR", folio="F-1")
        antes = doc_pdf_files()
        assert crear(client, h["ana"], files=[pdf_file()]).status_code == 400
        assert doc_pdf_files() == antes

    def test_folio_en_recepcionados_tambien_bloquea(self, client, h, db):
        db.insert_solicitud("tabla_recepcionados", solicitante="otro", folio="F-1", folio_uno="F-1")
        assert crear(client, h["ana"]).status_code == 400

    @pytest.mark.parametrize("estado", ["PAGADO", "APROBADO FINANZAS", "RECEPCIONADO", "APROBADO NIVEL 2"])
    def test_solicitante_no_puede_crear_en_estado_avanzado(self, client, h, db, estado):
        """HALLAZGO H-02: el estado inicial lo elegía el cliente; un Solicitante podía nacer 'PAGADO'."""
        r = crear(client, h["ana"], estado=estado)
        assert r.status_code == 403
        assert db.count("tabla_todas_solicitudes") == 0

    @pytest.mark.parametrize("estado", ["ESPERANDO", "PENDIENTE"])
    def test_solicitante_puede_crear_en_estados_iniciales(self, client, h, db, estado):
        assert crear(client, h["ana"], estado=estado).status_code == 200
        assert db.scalar("SELECT estado FROM tabla_todas_solicitudes") == estado

    @pytest.mark.parametrize("cambio,codigo", [
        ({"anio": "2019"}, 400), ({"mes_de_proceso": "ENERITO"}, 400), ({"montos_por_folio": ["-5", "1"]}, 400),
        ({"fecha_solicitud": "31-12-2026"}, 422), ({"anio": "dos mil"}, 422), ({"forma_pago": ["EFECTIVO"]}, 400),
    ])
    def test_validaciones(self, client, h, db, cambio, codigo):
        r = crear(client, h["ana"], **cambio)
        assert r.status_code == codigo
        assert db.count("tabla_todas_solicitudes") == (1 if codigo == 200 else 0)

    def test_campos_obligatorios_ausentes_422(self, client, h, db):
        data = form()
        del data["empresa"]
        assert client.post(f"{API}/todas_solicitudes", data=data, headers=h["ana"]).status_code == 422
        assert db.count("tabla_todas_solicitudes") == 0

    def test_archivo_no_pdf_no_se_sirve_como_html(self, client, h, db):
        """HALLAZGO H-03: un .html subido como respaldo se guardaba con su extensión y se servía como
        text/html inline desde el mismo origen (XSS almacenado)."""
        evil = b"<html><script>fetch('/flujopago/gestion-pagos/v1/usuarios')</script></html>"
        r = crear(client, h["ana"], files=[pdf_file("F-1_evil.html", evil, "application/pdf")])
        assert r.status_code == 200
        path = db.scalar("SELECT pdf_folio_uno FROM tabla_todas_solicitudes")
        assert path.endswith(".pdf")
        d = client.get(f"{API}/{path}", headers=h["ana"])
        assert d.status_code == 200
        assert "text/html" not in d.headers["content-type"]

    @pytest.mark.xfail(strict=True, reason="HALLAZGO H-17: un mismo folio repetido dentro de la misma solicitud se acepta.")
    def test_folio_repetido_en_la_misma_solicitud_400(self, client, h):
        assert crear(client, h["ana"], folio=["F-9", "F-9"], montos_por_folio=["1", "1"]).status_code == 400


# ====================================================================== GET
class TestListar:
    def setup_data(self, db, users):
        db.insert_solicitud(usuario_id=users["ana"].id, solicitante="ana perez", folio="A-1")
        db.insert_solicitud(usuario_id=users["beto"].id, solicitante="beto rojas", obra="OBRA SUR", folio="B-1")
        db.insert_solicitud(usuario_id=users["admin"].id, solicitante="otro", obra="OBRA NORTE", folio="O-1")

    def ids(self, client, hdr):
        return sorted(s["folio"] for s in data_of(client.get(f"{API}/todas_solicitudes", headers=hdr)))

    def test_aislamiento_por_usuario_y_obra(self, client, h, users, db):
        self.setup_data(db, users)
        assert self.ids(client, h["ana"]) == ["A-1"]
        assert self.ids(client, h["beto"]) == ["B-1"]
        assert self.ids(client, h["sinobra"]) == []
        assert self.ids(client, h["admin"]) == ["A-1", "B-1", "O-1"]
        assert self.ids(client, h["rrhh"]) == ["A-1", "B-1", "O-1"]
        assert self.ids(client, h["fin"]) == ["A-1", "B-1", "O-1"]


# ====================================================================== PATCH
class TestActualizar:
    def mk(self, db, users, **kw):
        return db.insert_solicitud(usuario_id=users["ana"].id, solicitante="ana perez", **kw)

    def patch(self, client, hdr, sid, body):
        return client.patch(f"{API}/todas_solicitudes/{sid}", json=body, headers=hdr)

    def test_dueno_envia_a_aprobacion_y_queda_en_historico(self, client, h, users, db):
        sid = self.mk(db, users)
        assert self.patch(client, h["ana"], sid, {"estado": "PENDIENTE"}).status_code == 200
        assert db.scalar("SELECT estado FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) == "PENDIENTE"
        hist = db.all("SELECT estado, usuario_id FROM tabla_historico WHERE id_solicitud_origen=%s", (sid,))
        assert hist == [{"estado": "PENDIENTE", "usuario_id": users["ana"].id}]

    @pytest.mark.parametrize("actual,destino", [
        ("ESPERANDO", "APROBADO FINANZAS"), ("PENDIENTE", "PAGADO"), ("ESPERANDO", "RECEPCIONADO"),
        ("ESPERANDO", "APROBADO NIVEL 2"), ("PENDIENTE", "APROBADO NIVEL 2"), ("ESPERANDO", "APROBADO NIVEL 1"),
        ("PENDIENTE", "APROBADO NIVEL 1"), ("APROBADO NIVEL 1", "APROBADO NIVEL 2"), ("PENDIENTE", "RECHAZADO"),
    ])
    def test_dueno_no_puede_autoaprobarse(self, client, h, users, db, actual, destino):
        """HALLAZGO H-01 (CRÍTICO): el dueño podía fijar cualquier estado, saltándose RRHH, Subgerencia y Finanzas."""
        sid = self.mk(db, users, estado=actual)
        assert self.patch(client, h["ana"], sid, {"estado": destino}).status_code == 403
        assert db.scalar("SELECT estado FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) == actual
        assert db.count("tabla_historico") == 0

    @pytest.mark.parametrize("actual,destino", [
        ("PENDIENTE", "APROBADO NIVEL 1"), ("APROBADO NIVEL 1", "APROBADO NIVEL 2"),
        ("RECHAZADO", "PENDIENTE"), ("APROBADO NIVEL 2", "PENDIENTE"), ("PENDIENTE", "PENDIENTE"),
    ])
    def test_dueno_conserva_transiciones_del_flujo_de_correccion(self, client, h, users, db, actual, destino):
        """Regresión de la regla existente 'Modificar y reenviar' (frontend editTransition)."""
        sid = self.mk(db, users, estado=actual, modificacion_solicitud=True)
        assert self.patch(client, h["ana"], sid, {"estado": destino, "modificacion_solicitud": False}).status_code == 200
        assert db.scalar("SELECT estado FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) == destino

    def test_aprobador_aprueba_solicitud_ajena(self, client, h, users, db):
        sid = self.mk(db, users, estado="PENDIENTE")
        body = {"estado": "APROBADO NIVEL 1", "reviso": "Subgerente de Capital Humano", "observaciones_devolucion": "ok"}
        assert self.patch(client, h["rrhh"], sid, body).status_code == 200
        assert db.one("SELECT estado, reviso FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) == {
            "estado": "APROBADO NIVEL 1", "reviso": "Subgerente de Capital Humano"}
        assert db.count("tabla_historico", "estado='APROBADO NIVEL 1'") == 1

    def test_finanzas_aprueba(self, client, h, users, db):
        sid = self.mk(db, users, estado="APROBADO NIVEL 2", reviso="Jefe de Finanzas")
        assert self.patch(client, h["fin"], sid, {"estado": "APROBADO FINANZAS"}).status_code == 200

    def test_no_dueno_403_sin_cambios(self, client, h, users, db):
        sid = self.mk(db, users)
        assert self.patch(client, h["beto"], sid, {"observaciones": "hack"}).status_code == 403
        assert db.scalar("SELECT observaciones FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) is None

    def test_autoria_es_inmutable(self, client, h, users, db):
        sid = self.mk(db, users)
        self.patch(client, h["admin"], sid, {"solicitante": "otro", "usuario_id": users["beto"].id})
        assert db.one("SELECT solicitante, usuario_id FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) == {
            "solicitante": "ana perez", "usuario_id": users["ana"].id}

    def test_monto_es_inmutable(self, client, h, users, db):
        """HALLAZGO H-19: el mensaje de negocio dice 'monto original inmutable' pero PATCH lo sobrescribía."""
        sid = self.mk(db, users)
        assert self.patch(client, h["ana"], sid, {"monto": 999999}).status_code == 200
        assert float(db.scalar("SELECT monto FROM tabla_todas_solicitudes WHERE id=%s", (sid,))) == 1000

    def test_suma_de_folios_mayor_al_monto_400(self, client, h, users, db):
        sid = self.mk(db, users)
        r = self.patch(client, h["ana"], sid, {"folio_dos": "F-77", "monto_por_folio_dos": 1})
        assert r.status_code == 400
        assert db.scalar("SELECT folio_dos FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) is None

    def test_redistribuir_folios_regenera_folio_consolidado(self, client, h, users, db):
        sid = self.mk(db, users)
        body = {"monto_por_folio_uno": 700, "folio_dos": "F-2000", "monto_por_folio_dos": 300}
        assert self.patch(client, h["ana"], sid, body).status_code == 200
        assert db.scalar("SELECT folio FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) == '["F-1000","F-2000"]'

    def test_quitar_todos_los_folios_400_y_no_500(self, client, h, users, db):
        """HALLAZGO H-20: 'folio' es NOT NULL; vaciar todos los folios producía IntegrityError → 500."""
        sid = self.mk(db, users)
        r = self.patch(client, h["ana"], sid, {"folio_uno": None, "monto_por_folio_uno": None})
        assert r.status_code == 400
        assert db.scalar("SELECT folio_uno FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) == "F-1000"

    def test_folio_duplicado_400(self, client, h, users, db):
        db.insert_solicitud(usuario_id=users["beto"].id, solicitante="beto rojas", obra="OBRA SUR", folio="B-1", folio_uno="B-1")
        sid = self.mk(db, users)
        assert self.patch(client, h["ana"], sid, {"folio_uno": "B-1"}).status_code == 400

    def test_estado_invalido_422(self, client, h, users, db):
        sid = self.mk(db, users)
        assert self.patch(client, h["ana"], sid, {"estado": "BORRADO"}).status_code == 422

    def test_inexistente(self, client, h):
        assert self.patch(client, h["ana"], 9999, {"estado": "PENDIENTE"}).status_code == 404
        # Documentado (H-21, BAJO): por la rama privilegiada el servicio responde 400 en vez de 404.
        assert self.patch(client, h["admin"], 9999, {"estado": "PENDIENTE"}).status_code == 400

    def test_operaciones_consecutivas_dejan_historico_completo(self, client, h, users, db):
        sid = self.mk(db, users)
        self.patch(client, h["ana"], sid, {"estado": "PENDIENTE"})
        self.patch(client, h["rrhh"], sid, {"estado": "APROBADO NIVEL 1"})
        self.patch(client, h["rrhh"], sid, {"estado": "APROBADO NIVEL 1"})   # repetido: no duplica histórico
        self.patch(client, h["fin"], sid, {"estado": "APROBADO NIVEL 2"})
        estados = [r["estado"] for r in db.all(
            "SELECT estado FROM tabla_historico WHERE id_solicitud_origen=%s ORDER BY id", (sid,))]
        assert estados == ["PENDIENTE", "APROBADO NIVEL 1", "APROBADO NIVEL 2"]


# ====================================================================== PDFs por folio
class TestPdfFolio:
    def mk(self, db, users):
        return db.insert_solicitud(usuario_id=users["ana"].id, solicitante="ana perez")

    def upload(self, client, hdr, sid, field="pdf_folio_uno", content=None, ctype="application/pdf"):
        return client.post(f"{API}/todas_solicitudes/{sid}/pdf", data={"field_name": field},
                           files={"pdf": ("respaldo.pdf", content or make_pdf_bytes(), ctype)}, headers=hdr)

    def test_dueno_sube_y_elimina(self, client, h, users, db):
        sid = self.mk(db, users)
        r = self.upload(client, h["ana"], sid)
        assert r.status_code == 200
        path = db.scalar("SELECT pdf_folio_uno FROM tabla_todas_solicitudes WHERE id=%s", (sid,))
        assert (ROOT / path).is_file()
        r = client.delete(f"{API}/todas_solicitudes/{sid}/pdf", params={"field_name": "pdf_folio_uno", "pdf_path": path}, headers=h["ana"])
        assert r.status_code == 200
        assert db.scalar("SELECT pdf_folio_uno FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) is None
        assert not (ROOT / path).exists()

    def test_otro_usuario_no_puede_subir(self, client, h, users, db):
        """HALLAZGO H-07 (IDOR): cualquier usuario autenticado reemplazaba respaldos de solicitudes ajenas."""
        sid = self.mk(db, users)
        antes = doc_pdf_files()
        assert self.upload(client, h["beto"], sid).status_code == 403
        assert db.scalar("SELECT pdf_folio_uno FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) is None
        assert doc_pdf_files() == antes

    def test_otro_usuario_no_puede_eliminar(self, client, h, users, db):
        sid = self.mk(db, users)
        path = data_of(self.upload(client, h["ana"], sid))["pdf_path"]
        r = client.delete(f"{API}/todas_solicitudes/{sid}/pdf", params={"field_name": "pdf_folio_uno", "pdf_path": path}, headers=h["beto"])
        assert r.status_code == 403
        assert (ROOT / path).is_file()
        assert db.scalar("SELECT pdf_folio_uno FROM tabla_todas_solicitudes WHERE id=%s", (sid,)) == path

    def test_aprobador_puede_gestionar_respaldo(self, client, h, users, db):
        assert self.upload(client, h["rrhh"], self.mk(db, users)).status_code == 200

    def test_campo_invalido_400_no_500(self, client, h, users, db):
        """HALLAZGO H-22: el HTTPException(400) se capturaba en un except genérico y salía como 500."""
        r = self.upload(client, h["ana"], self.mk(db, users), field="hashed_password")
        assert r.status_code == 400

    def test_no_pdf_400_y_404(self, client, h, users, db):
        sid = self.mk(db, users)
        assert self.upload(client, h["ana"], sid, ctype="text/plain").status_code == 400
        assert self.upload(client, h["ana"], 9999).status_code == 404

    def test_eliminar_con_ruta_distinta_400(self, client, h, users, db):
        sid = self.mk(db, users)
        path = data_of(self.upload(client, h["ana"], sid))["pdf_path"]
        r = client.delete(f"{API}/todas_solicitudes/{sid}/pdf", params={"field_name": "pdf_folio_uno", "pdf_path": "doc_pdf/otro.pdf"}, headers=h["ana"])
        assert r.status_code == 400 and (ROOT / path).is_file()


# ====================================================================== DELETE
class TestEliminar:
    def test_dueno_elimina_con_archivos(self, client, h, users, db):
        crear(client, h["ana"], files=[pdf_file()])
        sid, path = db.one("SELECT id, pdf_folio_uno FROM tabla_todas_solicitudes").values()
        assert client.delete(f"{API}/todas_solicitudes/{sid}", headers=h["ana"]).status_code == 200
        assert db.count("tabla_todas_solicitudes") == 0 and not (ROOT / path).exists()

    def test_preserve_files_conserva_pdfs(self, client, h, users, db):
        crear(client, h["ana"], files=[pdf_file()])
        sid, path = db.one("SELECT id, pdf_folio_uno FROM tabla_todas_solicitudes").values()
        assert client.delete(f"{API}/todas_solicitudes/{sid}?preserve_files=true", headers=h["fin"]).status_code == 200
        assert (ROOT / path).is_file()

    def test_no_dueno_403(self, client, h, users, db):
        sid = db.insert_solicitud(usuario_id=users["ana"].id)
        assert client.delete(f"{API}/todas_solicitudes/{sid}", headers=h["beto"]).status_code == 403
        assert db.count("tabla_todas_solicitudes") == 1

    def test_inexistente_404(self, client, h):
        assert client.delete(f"{API}/todas_solicitudes/9999", headers=h["admin"]).status_code == 404
        assert client.delete(f"{API}/todas_solicitudes/9999", headers=h["ana"]).status_code == 404


# ====================================================================== Concurrencia
@pytest.mark.xfail(strict=True, reason="HALLAZGO H-08: la unicidad de folio se valida con SELECT previo y sin restricción "
                   "en BD; dos creaciones simultáneas con el mismo folio se registran ambas (condición de carrera).")
def test_creaciones_concurrentes_no_duplican_folio(db, users, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool
    from app.domain.dto.todas_solicitudesDTO import Todas_SolicitudesIn
    import app.domain.services.todas_solicitudes as svc

    original = svc.check_folio_exists_global

    async def scenario():
        barrier = asyncio.Barrier(2)

        async def check_then_wait(*a, **k):        # ambas validaciones terminan antes de cualquier INSERT
            res = await original(*a, **k)
            await barrier.wait()
            return res

        monkeypatch.setattr(svc, "check_folio_exists_global", check_then_wait)
        engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
        dto = Todas_SolicitudesIn(
            usuario_id=users["ana"].id, solicitante="ana perez", fecha_solicitud=HOY, folio=["RACE-1"], empresa="ANDES",
            obra="OBRA NORTE", proceso="P", monto=1, reviso="r", mes_de_proceso="NOVIEMBRE", anio=2026,
            cuenta_contable="1", auxiliar="1", fecha_de_pago=HOY, unidad_de_negocio="U", folio_uno="RACE-1",
            monto_por_folio_uno=1)

        async def one():
            async with AsyncSession(engine) as s:
                return await svc.crear_todas_solicitudes_service(dto, s)

        results = await asyncio.gather(one(), one(), return_exceptions=True)
        await engine.dispose()
        return results

    asyncio.run(scenario())
    assert db.count("tabla_todas_solicitudes", "folio_uno='RACE-1'") == 1
