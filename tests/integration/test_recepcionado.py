"""
Recepcionado: GET/POST /recepcionado, PATCH /recepcionado/{id},
POST /recepcionado/{id}/guardar-como-solicitud, POST /recepcionado/{id}/reenviar,
POST/DELETE /recepcionado/{id}/pdf
"""
from datetime import date, timedelta

import pytest

from tests.integration.conftest import API, ROOT, data_of, make_pdf_bytes, solicitud_row

HOY = date.today()


def recep_body(origen_id=None, **kw):
    """Réplica del payload de frontend buildRecepcionadoPayload (recepción desde Finanzas)."""
    body = {
        "solicitante": "ana perez", "fecha_emision": HOY.isoformat(), "fecha_solicitud": HOY.isoformat(),
        "folio": "F-1000", "empresa": "ANDES", "obra": "OBRA NORTE", "proceso": "REMUNERACIONES", "monto": 1000,
        "estado": "RECEPCIONADO", "reviso": "Recepcionado", "mes_de_proceso": "NOVIEMBRE", "anio": 2026,
        "cuenta_contable": "211310", "auxiliar": "0010", "fecha_de_pago": (HOY + timedelta(days=5)).isoformat(),
        "unidad_de_negocio": "UNE-1", "glosa": "g", "observaciones": "o", "fecha_aprobacion": HOY.isoformat(),
        "folio_uno": "F-1000", "monto_por_folio_uno": 1000, "tipo_solicitud": "Mis Solicitudes",
        "id_solicitud_origen": origen_id, "modificacion_solicitud": False,
    }
    body.update(kw)
    return body


def recepcionado(db, users, **kw):
    kw.setdefault("usuario_id", users["ana"].id)
    return db.insert_solicitud("tabla_recepcionados", **kw)


class TestCrear:
    def test_finanzas_recepciona_y_registra_historico(self, client, h, users, db):
        origen = db.insert_solicitud(usuario_id=users["ana"].id, estado="APROBADO FINANZAS")
        r = client.post(f"{API}/recepcionado", json=recep_body(origen), headers=h["fin"])
        assert r.status_code == 200, r.text
        row = db.one("SELECT * FROM tabla_recepcionados")
        assert row["estado"] == "RECEPCIONADO" and float(row["monto"]) == 1000
        hist = db.all("SELECT estado FROM tabla_historico WHERE id_solicitud_origen=%s", (row["id"],))
        assert hist == [{"estado": "RECEPCIONADO"}]

    def test_recepcion_conserva_al_dueno_original(self, client, h, users, db):
        """HALLAZGO H-23: usuario_id se sobrescribía con el usuario de Finanzas; el solicitante perdía la
        propiedad del registro (403 al editarlo) y la conversión posterior quedaba a nombre de Finanzas."""
        origen = db.insert_solicitud(usuario_id=users["ana"].id, estado="APROBADO FINANZAS")
        client.post(f"{API}/recepcionado", json=recep_body(origen), headers=h["fin"])
        assert db.scalar("SELECT usuario_id FROM tabla_recepcionados") == users["ana"].id

    def test_pdf_firmado_fuerza_pagado(self, client, h, users, db):
        origen = db.insert_solicitud(usuario_id=users["ana"].id, estado="APROBADO FINANZAS")
        client.post(f"{API}/recepcionado", json=recep_body(origen, pdf_firmado="PDF_firmados/x.pdf"), headers=h["fin"])
        assert db.scalar("SELECT estado FROM tabla_recepcionados") == "PAGADO"

    @pytest.mark.parametrize("quien", ["ana", "beto", "rrhh"])
    def test_solo_finanzas_o_admin_pueden_recepcionar(self, client, h, users, db, quien):
        """HALLAZGO H-01b (CRÍTICO): cualquier usuario podía crear un recepcionado (incluso PAGADO) sin aprobación."""
        r = client.post(f"{API}/recepcionado", json=recep_body(None, pdf_firmado="x.pdf", folio="Z-1", folio_uno="Z-1"), headers=h[quien])
        assert r.status_code == 403
        assert db.count("tabla_recepcionados") == 0 and db.count("tabla_historico") == 0

    def test_folio_de_otra_solicitud_400(self, client, h, users, db):
        db.insert_solicitud(usuario_id=users["beto"].id, solicitante="beto rojas", folio="F-1000")
        r = client.post(f"{API}/recepcionado", json=recep_body(None), headers=h["fin"])
        assert r.status_code == 400 and db.count("tabla_recepcionados") == 0

    def test_flujo_completo_recepcionar_mueve_el_registro(self, client, h, users, db):
        origen = db.insert_solicitud(usuario_id=users["ana"].id, estado="APROBADO FINANZAS")
        assert client.post(f"{API}/recepcionado", json=recep_body(origen), headers=h["fin"]).status_code == 200
        assert client.delete(f"{API}/todas_solicitudes/{origen}?preserve_files=true", headers=h["fin"]).status_code == 200
        assert db.count("tabla_todas_solicitudes") == 0 and db.count("tabla_recepcionados") == 1

    @pytest.mark.parametrize("cambio", [{"anio": 2019}, {"mes_de_proceso": "X"}, {"monto": -1}, {"estado": "OTRO"}])
    def test_validacion_422(self, client, h, db, cambio):
        assert client.post(f"{API}/recepcionado", json=recep_body(None, **cambio), headers=h["fin"]).status_code == 422
        assert db.count("tabla_recepcionados") == 0


class TestListar:
    def test_solicitante_ve_lo_suyo_sin_pagados(self, client, h, users, db):
        recepcionado(db, users, folio="A-REC")
        recepcionado(db, users, folio="A-PAG", estado="PAGADO")
        recepcionado(db, users, usuario_id=users["beto"].id, solicitante="beto rojas", obra="OBRA SUR", folio="B-REC")
        folios = lambda u: sorted(x["folio"] for x in data_of(client.get(f"{API}/recepcionado", headers=h[u])))
        assert folios("ana") == ["A-REC"]
        assert folios("beto") == ["B-REC"]
        assert folios("admin") == ["A-PAG", "A-REC", "B-REC"]
        assert folios("sinobra") == []


class TestActualizar:
    def test_dueno_actualiza_tipo_pasa_a_recepcionado_y_monto_inmutable(self, client, h, users, db):
        rid = recepcionado(db, users)
        r = client.patch(f"{API}/recepcionado/{rid}", json={"observaciones": "nueva", "monto": 5}, headers=h["ana"])
        assert r.status_code == 200
        row = db.one("SELECT observaciones, tipo_solicitud, monto FROM tabla_recepcionados WHERE id=%s", (rid,))
        assert row["observaciones"] == "nueva" and row["tipo_solicitud"] == "Recepcionado" and float(row["monto"]) == 1000

    def test_no_dueno_403(self, client, h, users, db):
        rid = recepcionado(db, users)
        assert client.patch(f"{API}/recepcionado/{rid}", json={"observaciones": "x"}, headers=h["beto"]).status_code == 403

    def test_cambio_de_estado_registra_historico(self, client, h, users, db):
        rid = recepcionado(db, users)
        client.patch(f"{API}/recepcionado/{rid}", json={"estado": "PAGADO"}, headers=h["admin"])
        assert db.count("tabla_historico", "id_solicitud_origen=%s AND estado='PAGADO'", (rid,)) == 1


class TestGuardarComoSolicitud:
    url = API + "/recepcionado/{}/guardar-como-solicitud"

    def test_dueno_convierte_atomicamente(self, client, h, users, db):
        rid = recepcionado(db, users)
        r = client.post(self.url.format(rid), json={"observaciones": "corregido", "estado": "PENDIENTE"}, headers=h["ana"])
        assert r.status_code == 200
        nueva = db.one("SELECT * FROM tabla_todas_solicitudes")
        assert (nueva["estado"], nueva["reviso"], nueva["tipo_solicitud"]) == ("PENDIENTE", "Jefe de Recursos Humanos", "Recepcionado")
        assert nueva["usuario_id"] == users["ana"].id and nueva["observaciones"] == "corregido"
        assert db.count("tabla_recepcionados") == 0

    def test_otro_usuario_no_puede_convertir(self, client, h, users, db):
        """HALLAZGO H-07b (IDOR): cualquier usuario convertía/eliminaba recepcionados ajenos (incluso PAGADOS)."""
        rid = recepcionado(db, users, estado="PAGADO")
        assert client.post(self.url.format(rid), json={}, headers=h["beto"]).status_code == 403
        assert db.count("tabla_recepcionados") == 1 and db.count("tabla_todas_solicitudes") == 0

    def test_estado_siempre_reinicia_en_pendiente(self, client, h, users, db):
        """HALLAZGO H-24: el docstring exige 'PENDIENTE' pero se respetaba el estado enviado por el cliente."""
        rid = recepcionado(db, users)
        client.post(self.url.format(rid), json={"estado": "APROBADO FINANZAS"}, headers=h["ana"])
        assert db.scalar("SELECT estado FROM tabla_todas_solicitudes") == "PENDIENTE"

    def test_fallo_de_insercion_hace_rollback_y_no_filtra_sql(self, client, h, users, db):
        rid = recepcionado(db, users)
        r = client.post(self.url.format(rid), json={"glosa": "G" * 80}, headers=h["ana"])  # glosa VARCHAR(50)
        assert r.status_code == 400
        assert "INSERT" not in r.text and "asyncpg" not in r.text
        assert db.count("tabla_recepcionados") == 1 and db.count("tabla_todas_solicitudes") == 0

    def test_suma_de_folios_excede_monto_400(self, client, h, users, db):
        rid = recepcionado(db, users)
        assert client.post(self.url.format(rid), json={"monto_por_folio_dos": 1, "folio_dos": "X"}, headers=h["ana"]).status_code == 400
        assert db.count("tabla_recepcionados") == 1

    def test_inexistente_400(self, client, h):
        assert client.post(self.url.format(9999), json={}, headers=h["admin"]).status_code == 400


class TestReenviar:
    url = API + "/recepcionado/{}/reenviar"

    def body(self, **kw):
        b = {k: v for k, v in recep_body(None).items() if k not in ("fecha_aprobacion", "id_solicitud_origen", "tipo_solicitud")}
        b.update(kw)
        return b

    def test_dueno_reenvia(self, client, h, users, db):
        rid = recepcionado(db, users)
        r = client.post(self.url.format(rid), json=self.body(), headers=h["ana"])
        assert r.status_code == 200, r.text
        assert db.count("tabla_recepcionados") == 0
        assert db.one("SELECT estado, tipo_solicitud, usuario_id FROM tabla_todas_solicitudes") == {
            "estado": "RECHAZADO", "tipo_solicitud": "Recepcionado", "usuario_id": users["ana"].id}

    def test_otro_usuario_403(self, client, h, users, db):
        rid = recepcionado(db, users)
        assert client.post(self.url.format(rid), json=self.body(), headers=h["beto"]).status_code == 403
        assert db.count("tabla_recepcionados") == 1

    def test_folio_distinto_400(self, client, h, users, db):
        rid = recepcionado(db, users)
        assert client.post(self.url.format(rid), json=self.body(folio="OTRO"), headers=h["ana"]).status_code == 400
        assert db.count("tabla_recepcionados") == 1


class TestPdfRecepcionado:
    def upload(self, client, hdr, rid, field="pdf_folio_uno"):
        return client.post(f"{API}/recepcionado/{rid}/pdf", data={"field_name": field},
                           files={"pdf": ("r.pdf", make_pdf_bytes(), "application/pdf")}, headers=hdr)

    def test_dueno_sube_y_elimina(self, client, h, users, db):
        rid = recepcionado(db, users)
        path = data_of(self.upload(client, h["ana"], rid))["pdf_path"]
        assert (ROOT / path).is_file()
        r = client.delete(f"{API}/recepcionado/{rid}/pdf", params={"field_name": "pdf_folio_uno", "pdf_path": path}, headers=h["ana"])
        assert r.status_code == 200 and not (ROOT / path).exists()

    def test_otro_usuario_403(self, client, h, users, db):
        rid = recepcionado(db, users)
        assert self.upload(client, h["beto"], rid).status_code == 403
        assert db.scalar("SELECT pdf_folio_uno FROM tabla_recepcionados WHERE id=%s", (rid,)) is None

    def test_otro_usuario_no_elimina(self, client, h, users, db):
        rid = recepcionado(db, users)
        path = data_of(self.upload(client, h["ana"], rid))["pdf_path"]
        r = client.delete(f"{API}/recepcionado/{rid}/pdf", params={"field_name": "pdf_folio_uno", "pdf_path": path}, headers=h["beto"])
        assert r.status_code == 403 and (ROOT / path).is_file()

    def test_campo_invalido_400(self, client, h, users, db):
        assert self.upload(client, h["ana"], recepcionado(db, users), field="estado").status_code == 400
