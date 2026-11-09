"""
Histórico (GET /historico, /historico/solicitud/{id}, /historico/estado/{estado},
/historico/solicitante/{s}, /historico/estadisticas), PDFs firmados / de autorización
(/pdf-firmado/*, /pdf-registro-autorizacion/*) y descargas protegidas (/doc_pdf, /PDF_firmados, /PDF_autorizaciones).
"""
import json
from datetime import datetime

import pytest

from tests.integration.conftest import API, ROOT, data_of, make_pdf_bytes, solicitud_row


def hist(db, users, quien="ana", **kw):
    row = solicitud_row(usuario_id=users[quien].id, solicitante=f"{users[quien].nombre_1} {users[quien].apellido_1}",
                        obra="OBRA NORTE" if quien == "ana" else "OBRA SUR", **kw)
    row.setdefault("id_solicitud_origen", 1)
    row.pop("modificacion_solicitud")
    row["fecha_registro_historico"] = datetime.utcnow()
    return db.insert("tabla_historico", row)


@pytest.fixture
def historico(db, users):
    hist(db, users, "ana", estado="PENDIENTE", id_solicitud_origen=1)
    hist(db, users, "ana", estado="PAGADO", id_solicitud_origen=1)
    hist(db, users, "beto", estado="PENDIENTE", id_solicitud_origen=2, monto=987654)


class TestHistorico:
    def get(self, client, hdr, path):
        return client.get(f"{API}/historico{path}", headers=hdr)

    def test_listado_aislado(self, client, h, historico):
        assert len(data_of(self.get(client, h["ana"], ""))) == 2
        assert len(data_of(self.get(client, h["admin"], ""))) == 3

    def test_por_solicitud_ajena_vacio(self, client, h, historico):
        assert data_of(self.get(client, h["ana"], "/solicitud/2")) == []
        assert len(data_of(self.get(client, h["beto"], "/solicitud/2"))) == 1

    def test_por_estado_no_expone_registros_ajenos(self, client, h, historico):
        """HALLAZGO H-05b: /estado, /solicitante y /estadisticas no aplicaban el filtro por usuario/obra."""
        r = self.get(client, h["ana"], "/estado/PENDIENTE")
        assert r.status_code == 200
        assert {x["solicitante"] for x in data_of(r)} == {"ana perez"}

    def test_por_solicitante_no_expone_registros_ajenos(self, client, h, historico):
        assert data_of(self.get(client, h["ana"], "/solicitante/beto")) == []
        assert len(data_of(self.get(client, h["admin"], "/solicitante/beto"))) == 1

    def test_estadisticas_limitadas_al_alcance_del_usuario(self, client, h, historico):
        assert data_of(self.get(client, h["ana"], "/estadisticas"))["total_registros"] == 2
        assert data_of(self.get(client, h["admin"], "/estadisticas"))["total_registros"] == 3

    def test_estado_pagado_es_consultable(self, client, h, historico):
        """HALLAZGO H-25: PAGADO se registra en histórico pero /historico/estado/PAGADO respondía 400."""
        r = self.get(client, h["admin"], "/estado/PAGADO")
        assert r.status_code == 200 and len(data_of(r)) == 1

    def test_estado_invalido_400(self, client, h):
        assert self.get(client, h["admin"], "/estado/INVENTADO").status_code == 400

    def test_sin_token_401(self, client):
        assert client.get(f"{API}/historico").status_code == 401


def upload(client, hdr, kind, ids, content=None, ctype="application/pdf"):
    return client.post(f"{API}/{kind}/upload", data={"ids": json.dumps(ids) if not isinstance(ids, str) else ids},
                       files={"pdf": ("f.pdf", content or make_pdf_bytes(), ctype)}, headers=hdr)


class TestPdfFirmadoYAutorizacion:
    def test_finanzas_asocia_firmado_a_varias_solicitudes(self, client, h, users, db):
        a = db.insert_solicitud(usuario_id=users["ana"].id, folio="A")
        b = db.insert_solicitud(usuario_id=users["ana"].id, folio="B")
        r = upload(client, h["fin"], "pdf-firmado", [a, b])
        assert r.status_code == 200
        paths = {x["pdf_firmado"] for x in db.all("SELECT pdf_firmado FROM tabla_todas_solicitudes")}
        assert len(paths) == 1 and (ROOT / paths.pop()).is_file()

    @pytest.mark.parametrize("kind", ["pdf-firmado", "pdf-registro-autorizacion"])
    def test_solicitante_no_puede_cargar(self, client, h, users, db, kind):
        """HALLAZGO H-07c: cualquier usuario autenticado adjuntaba/borraba PDFs firmados o de autorización de cualquier ID."""
        sid = db.insert_solicitud(usuario_id=users["beto"].id)
        assert upload(client, h["ana"], kind, [sid]).status_code == 403
        assert db.one("SELECT pdf_firmado, pdf_registro_autorizacion FROM tabla_todas_solicitudes") == {
            "pdf_firmado": None, "pdf_registro_autorizacion": None}

    @pytest.mark.parametrize("kind", ["pdf-firmado", "pdf-registro-autorizacion"])
    def test_solicitante_no_puede_eliminar(self, client, h, users, db, kind):
        sid = db.insert_solicitud(usuario_id=users["beto"].id, pdf_firmado="PDF_firmados/x.pdf", pdf_registro_autorizacion="PDF_autorizaciones/y.pdf")
        assert client.delete(f"{API}/{kind}/delete/{sid}", headers=h["ana"]).status_code == 403
        assert db.one("SELECT pdf_firmado, pdf_registro_autorizacion FROM tabla_todas_solicitudes")["pdf_firmado"] == "PDF_firmados/x.pdf"

    def test_eliminar_firmado_limpia_bd_y_archivo(self, client, h, users, db):
        sid = db.insert_solicitud(usuario_id=users["ana"].id)
        path = data_of(upload(client, h["fin"], "pdf-firmado", [sid]))["pdf_path"]
        assert client.delete(f"{API}/pdf-firmado/delete/{sid}", headers=h["fin"]).status_code == 200
        assert db.scalar("SELECT pdf_firmado FROM tabla_todas_solicitudes") is None
        assert not (ROOT / path).exists()

    def test_reemplazo_de_autorizacion_borra_archivo_anterior(self, client, h, users, db):
        sid = db.insert_solicitud(usuario_id=users["ana"].id)
        p1 = data_of(upload(client, h["rrhh"], "pdf-registro-autorizacion", [sid]))["pdf_path"]
        p2 = data_of(upload(client, h["rrhh"], "pdf-registro-autorizacion", [sid]))["pdf_path"]
        assert not (ROOT / p1).exists() and (ROOT / p2).is_file()
        assert db.scalar("SELECT pdf_registro_autorizacion FROM tabla_todas_solicitudes") == p2

    @pytest.mark.parametrize("ids", ["no-json", "[]", '{"a": 1}'])
    def test_ids_invalidos_400(self, client, h, ids):
        assert upload(client, h["fin"], "pdf-firmado", ids).status_code == 400

    def test_no_pdf_400_e_inexistente_404(self, client, h, users, db):
        sid = db.insert_solicitud(usuario_id=users["ana"].id)
        assert upload(client, h["fin"], "pdf-firmado", [sid], ctype="image/png").status_code == 400
        assert client.delete(f"{API}/pdf-firmado/delete/9999", headers=h["fin"]).status_code == 404

class TestDescargas:
    def _file(self, folder="doc_pdf", name="audit_test_file.pdf", content=None):
        p = ROOT / folder / name
        p.parent.mkdir(exist_ok=True)
        p.write_bytes(content or make_pdf_bytes())
        return p

    def test_autenticado_descarga_pdf(self, client, h):
        self._file()
        r = client.get(f"{API}/doc_pdf/audit_test_file.pdf", headers=h["ana"])
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")

    def test_sin_token_no_descarga(self, client):
        self._file()
        r = client.get(f"{API}/doc_pdf/audit_test_file.pdf", follow_redirects=False)
        assert r.status_code in (302, 401) and not r.content.startswith(b"%PDF")

    @pytest.mark.parametrize("path", ["doc_pdf/..%2F.env", "doc_pdf/%2E%2E%2F.env", "otra_carpeta/x.pdf", "doc_pdf/no_existe.pdf"])
    def test_rutas_invalidas_no_exponen_archivos(self, client, h, path):
        r = client.get(f"{API}/{path}", headers=h["ana"])
        assert r.status_code in (403, 404)
        assert b"SECRET_KEY" not in r.content

    def test_archivo_html_legado_no_se_renderiza_inline(self, client, h):
        """Defensa en profundidad para archivos .html ya existentes en disco (ver H-03)."""
        self._file(name="legacy_evil.html", content=b"<script>alert(1)</script>")
        r = client.get(f"{API}/doc_pdf/legacy_evil.html", headers=h["ana"])
        assert "text/html" not in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "")
