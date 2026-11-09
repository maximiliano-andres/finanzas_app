"""
Regresión de los hallazgos CRÍTICO/ALTO corregidos en la segunda fase de la auditoría:
  H-32 credenciales de prueba en el seed · H-04 truncado silencioso de listados
  H-06 propiedad por nombre (suplantación y homónimos) · H-26 contaminación cruzada de PDFs por ID
"""
import asyncio
import json
from datetime import datetime

import pytest

from app.infrastructure.security.hashing import hash_password, verify_password
from app.infrastructure.db.db_seed import CUENTAS_PRUEBA_COMPROMETIDAS
from tests.integration.conftest import (
    API, PASSWORD, ROOT, TEST_DATABASE_URL, User, auth, data_of, make_pdf_bytes, solicitud_row,
)


def _run_with_fresh_engine(monkeypatch, coro_factory):
    """Ejecuta una corrutina de arranque (seed) con un engine propio, fuera del loop del TestClient."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool
    import app.infrastructure.db.db_seed as seed

    async def run():
        engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
        monkeypatch.setattr(seed, "AsyncSessionLocal", async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False))
        try:
            return await coro_factory(seed)
        finally:
            await engine.dispose()

    return asyncio.run(run())


# =========================================================================== H-32
CLAVE_PUBLICADA = CUENTAS_PRUEBA_COMPROMETIDAS["casa2301teo@gmail.com"]


class TestCredencialesDePrueba:
    TEO = "casa2301teo@gmail.com"

    def _insert_teo(self, db, clave):
        return db.insert("usuarios", {
            "cargo": "Administrador", "nombre_1": "teo", "apellido_1": "casa", "email": self.TEO,
            "hashed_password": hash_password(clave), "rol_id": 1, "rut": "22222222-2", "mfa_enabled": True,
            "must_change_password": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()})

    def test_cuenta_con_clave_publicada_queda_inutilizable(self, client, db, monkeypatch):
        uid = self._insert_teo(db, CLAVE_PUBLICADA)
        n = _run_with_fresh_engine(monkeypatch, lambda s: s.desactivar_credenciales_de_prueba())
        assert n == 1
        row = db.one("SELECT hashed_password, must_change_password, mfa_enabled, rol_id FROM usuarios WHERE id=%s", (uid,))
        assert not verify_password(row["hashed_password"], CLAVE_PUBLICADA)
        assert row["must_change_password"] is True and row["mfa_enabled"] is False
        assert row["rol_id"] == 1                                   # no se altera el rol ni se borra el usuario
        r = client.post(f"{API}/login", json={"email": self.TEO, "password": CLAVE_PUBLICADA})
        assert r.status_code == 401

    def test_cuenta_que_ya_cambio_su_clave_no_se_toca(self, client, db, monkeypatch):
        uid = self._insert_teo(db, "Otra_Clave99!")
        before = db.scalar("SELECT hashed_password FROM usuarios WHERE id=%s", (uid,))
        assert _run_with_fresh_engine(monkeypatch, lambda s: s.desactivar_credenciales_de_prueba()) == 0
        assert db.scalar("SELECT hashed_password FROM usuarios WHERE id=%s", (uid,)) == before

    def _seed_desde_cero(self, db, monkeypatch):
        db.execute("TRUNCATE dispositivos_confianza, usuarios_obras, usuarios, procesos_auxiliares, procesos, "
                   "empresas, roles RESTART IDENTITY CASCADE")
        db.execute("DELETE FROM db_initialization_log")
        _run_with_fresh_engine(monkeypatch, lambda s: s.seed_data())

    def test_instalacion_nueva_no_crea_cuenta_de_prueba(self, client, db, monkeypatch):
        self._seed_desde_cero(db, monkeypatch)
        emails = [r["email"] for r in db.all("SELECT email FROM usuarios")]
        assert emails == ["super_admin@flujopago.cl"]
        h = db.scalar("SELECT hashed_password FROM usuarios")
        assert verify_password(h, "@Admin_Flujo2026")           # la del entorno (conftest), no una fija del código

    def test_sin_variable_de_entorno_no_usa_clave_por_defecto(self, client, db, monkeypatch):
        monkeypatch.delenv("SEED_SUPER_ADMIN_PASSWORD")
        self._seed_desde_cero(db, monkeypatch)
        h = db.scalar("SELECT hashed_password FROM usuarios")
        assert not verify_password(h, "@Admin_Flujo2026")

    def test_lista_blanca_de_emails_configurable(self, client, db, monkeypatch):
        self._insert_teo(db, PASSWORD)
        assert client.post(f"{API}/login", json={"email": self.TEO, "password": PASSWORD}).status_code == 200
        monkeypatch.setenv("EMAILS_PRUEBA_PERMITIDOS", "")
        client.cookies.clear()
        assert client.post(f"{API}/login", json={"email": self.TEO, "password": PASSWORD}).status_code == 422


# =========================================================================== H-04
class TestListadosCompletos:
    def test_sin_paginacion_retorna_todos_en_orden(self, client, h, db):
        for i in range(205):
            db.insert_solicitud(folio=f"P-{i}", folio_uno=f"P-{i}")
        lista = data_of(client.get(f"{API}/todas_solicitudes", headers=h["admin"]))
        assert len(lista) == 205
        assert [s["id"] for s in lista] == sorted(s["id"] for s in lista)

    def test_historico_sin_paginacion_supera_500(self, client, h, db, users):
        row = solicitud_row(usuario_id=users["ana"].id, id_solicitud_origen=1)
        row.pop("modificacion_solicitud")
        cols = ", ".join(list(row) + ["fecha_registro_historico"])
        vals = ", ".join(["%s"] * (len(row) + 1))
        for _ in range(510):
            db.execute(f"INSERT INTO tabla_historico ({cols}) VALUES ({vals})", (*row.values(), datetime.utcnow()))
        assert len(data_of(client.get(f"{API}/historico", headers=h["admin"]))) == 510

    def test_tope_de_seguridad_configurable(self, client, h, db, monkeypatch):
        monkeypatch.setenv("LISTADO_MAX_REGISTROS", "3")
        for i in range(5):
            db.insert_solicitud(folio=f"T-{i}", folio_uno=f"T-{i}")
        assert len(data_of(client.get(f"{API}/todas_solicitudes", headers=h["admin"]))) == 3

    def test_paginacion_explicita_sin_cambios(self, client, h, db):
        for i in range(250):
            db.insert_solicitud(folio=f"X-{i}", folio_uno=f"X-{i}")
        assert len(data_of(client.get(f"{API}/todas_solicitudes?limit=1000", headers=h["admin"]))) == 200


# =========================================================================== H-06
@pytest.fixture
def homonimo(db, users):
    """Otra persona con el MISMO nombre que Ana ('ana perez'), Solicitante en la misma obra."""
    uid = db.insert("usuarios", {
        "cargo": "Analista de personal", "nombre_1": "ana", "apellido_1": "perez", "email": "ana.dos@flujopago.cl",
        "hashed_password": "x", "rol_id": 2, "rut": "19999999-9", "mfa_enabled": False,
        "must_change_password": False, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()})
    db.execute("INSERT INTO usuarios_obras (usuario_id, obra_id) VALUES (%s, 1)", (uid,))
    return User("ana2", uid, "ana.dos@flujopago.cl", "Solicitante", 2, "Analista de personal", "ana", "perez", "19999999-9")


def _form(**kw):
    from tests.integration.test_solicitudes import form
    return form(**kw)


class TestPropiedad:
    def test_solicitante_no_puede_registrar_a_nombre_de_otro(self, client, h, db, users):
        r = client.post(f"{API}/todas_solicitudes", data=_form(solicitante="beto rojas"), headers=h["ana"])
        assert r.status_code == 200
        # Se registra con el nombre de la sesión, en el mismo formato que envía el frontend (user.nombre).
        assert db.one("SELECT solicitante, usuario_id FROM tabla_todas_solicitudes") == {
            "solicitante": "ana  perez", "usuario_id": users["ana"].id}

    def test_nombre_propio_se_conserva_tal_cual(self, client, h, db):
        client.post(f"{API}/todas_solicitudes", data=_form(solicitante="Ana  Perez"), headers=h["ana"])
        assert db.scalar("SELECT solicitante FROM tabla_todas_solicitudes") == "Ana  Perez"

    def test_rol_de_gestion_puede_registrar_por_otro(self, client, h, db):
        client.post(f"{API}/todas_solicitudes", data=_form(solicitante="beto rojas"), headers=h["admin"])
        assert db.scalar("SELECT solicitante FROM tabla_todas_solicitudes") == "beto rojas"

    def test_homonimo_no_ve_ni_modifica_lo_ajeno(self, client, h, db, users, homonimo):
        sid = db.insert_solicitud(usuario_id=users["ana"].id, solicitante="ana perez")
        hh = auth(homonimo)
        assert data_of(client.get(f"{API}/todas_solicitudes", headers=hh)) == []
        assert client.patch(f"{API}/todas_solicitudes/{sid}", json={"estado": "PENDIENTE"}, headers=hh).status_code == 403
        assert client.delete(f"{API}/todas_solicitudes/{sid}", headers=hh).status_code == 403
        r = client.post(f"{API}/todas_solicitudes/{sid}/pdf", data={"field_name": "pdf_folio_uno"},
                        files={"pdf": ("a.pdf", make_pdf_bytes(), "application/pdf")}, headers=hh)
        assert r.status_code == 403
        assert db.one("SELECT estado, pdf_folio_uno FROM tabla_todas_solicitudes") == {"estado": "ESPERANDO", "pdf_folio_uno": None}

    def test_homonimo_no_gestiona_recepcionado_ajeno(self, client, h, db, users, homonimo):
        rid = db.insert_solicitud("tabla_recepcionados", usuario_id=users["ana"].id, solicitante="ana perez")
        hh = auth(homonimo)
        assert data_of(client.get(f"{API}/recepcionado", headers=hh)) == []
        assert client.post(f"{API}/recepcionado/{rid}/guardar-como-solicitud", json={}, headers=hh).status_code == 403
        assert db.count("tabla_recepcionados") == 1

    def test_registro_heredado_sin_usuario_id_sigue_siendo_del_titular(self, client, h, db):
        sid = db.insert_solicitud(usuario_id=None, solicitante="ana perez")
        assert len(data_of(client.get(f"{API}/todas_solicitudes", headers=h["ana"]))) == 1
        assert client.patch(f"{API}/todas_solicitudes/{sid}", json={"estado": "PENDIENTE"}, headers=h["ana"]).status_code == 200

    def test_registro_cargado_por_tercero_sigue_siendo_del_titular(self, client, h, db, users):
        """Recepcionados antiguos quedaron con usuario_id de Finanzas (H-23): el titular por nombre conserva acceso."""
        rid = db.insert_solicitud("tabla_recepcionados", usuario_id=users["fin"].id, solicitante="ana perez")
        assert len(data_of(client.get(f"{API}/recepcionado", headers=h["ana"]))) == 1
        r = client.post(f"{API}/recepcionado/{rid}/guardar-como-solicitud", json={}, headers=h["ana"])
        assert r.status_code == 200


# =========================================================================== H-26
def _upload(client, hdr, kind, ids, **extra):
    data = {"ids": json.dumps(ids), **extra}
    return client.post(f"{API}/{kind}/upload", data=data, files={"pdf": ("f.pdf", make_pdf_bytes(), "application/pdf")}, headers=hdr)


def _hist(db, origen_id, folio, **kw):
    row = solicitud_row(id_solicitud_origen=origen_id, folio=folio, folio_uno=folio, **kw)
    row.pop("modificacion_solicitud")
    row["fecha_registro_historico"] = datetime.utcnow()
    return db.insert("tabla_historico", row)


class TestDocumentosSinContaminacion:
    @pytest.fixture
    def mismo_id(self, db, users):
        sid = db.insert_solicitud(usuario_id=users["ana"].id, folio="S-1", folio_uno="S-1")
        rid = db.insert_solicitud("tabla_recepcionados", usuario_id=users["beto"].id, solicitante="beto rojas", folio="R-1", folio_uno="R-1")
        assert sid == rid == 1
        return sid

    @pytest.mark.parametrize("kind,campo", [("pdf-firmado", "pdf_firmado"), ("pdf-registro-autorizacion", "pdf_registro_autorizacion")])
    def test_carga_por_defecto_solo_afecta_solicitudes(self, client, h, db, mismo_id, kind, campo):
        assert _upload(client, h["fin"], kind, [mismo_id]).status_code == 200
        assert db.scalar(f"SELECT {campo} FROM tabla_todas_solicitudes") is not None
        assert db.scalar(f"SELECT {campo} FROM tabla_recepcionados") is None

    def test_origen_recepcionado_solo_afecta_recepcionados(self, client, h, db, mismo_id):
        assert _upload(client, h["fin"], "pdf-firmado", [mismo_id], origen="recepcionado").status_code == 200
        assert db.scalar("SELECT pdf_firmado FROM tabla_recepcionados") is not None
        assert db.scalar("SELECT pdf_firmado FROM tabla_todas_solicitudes") is None

    def test_historico_se_empareja_por_id_y_folio(self, client, h, db, mismo_id):
        h_sol = _hist(db, mismo_id, "S-1")
        h_rec = _hist(db, mismo_id, "R-1")
        _upload(client, h["rrhh"], "pdf-registro-autorizacion", [mismo_id])
        assert db.scalar("SELECT pdf_registro_autorizacion FROM tabla_historico WHERE id=%s", (h_sol,)) is not None
        assert db.scalar("SELECT pdf_registro_autorizacion FROM tabla_historico WHERE id=%s", (h_rec,)) is None

    @pytest.mark.parametrize("kind,campo", [("pdf-firmado", "pdf_firmado"), ("pdf-registro-autorizacion", "pdf_registro_autorizacion")])
    def test_eliminar_no_toca_el_otro_registro_ni_su_archivo(self, client, h, db, mismo_id, kind, campo):
        p_rec = ROOT / "doc_pdf" / f"audit_rec_{campo}.pdf"
        p_rec.write_bytes(make_pdf_bytes())
        rel_rec = f"doc_pdf/{p_rec.name}"
        db.execute(f"UPDATE tabla_recepcionados SET {campo}=%s", (rel_rec,))
        h_rec = _hist(db, mismo_id, "R-1", **{campo: rel_rec})
        path_sol = data_of(_upload(client, h["fin"], kind, [mismo_id]))["pdf_path"]
        assert client.delete(f"{API}/{kind}/delete/{mismo_id}", headers=h["fin"]).status_code == 200
        assert db.scalar(f"SELECT {campo} FROM tabla_todas_solicitudes") is None and not (ROOT / path_sol).exists()
        assert db.scalar(f"SELECT {campo} FROM tabla_recepcionados") == rel_rec and p_rec.is_file()
        assert db.scalar(f"SELECT {campo} FROM tabla_historico WHERE id=%s", (h_rec,)) == rel_rec

    def test_eliminar_con_origen_recepcionado(self, client, h, db, mismo_id):
        _upload(client, h["fin"], "pdf-firmado", [mismo_id], origen="recepcionado")
        assert client.delete(f"{API}/pdf-firmado/delete/{mismo_id}", headers=h["fin"]).status_code == 404
        assert client.delete(f"{API}/pdf-firmado/delete/{mismo_id}?origen=recepcionado", headers=h["fin"]).status_code == 200
        assert db.scalar("SELECT pdf_firmado FROM tabla_recepcionados") is None

    @pytest.mark.parametrize("extra,ids", [({"origen": "historico"}, [1]), ({}, ["a"]), ({}, [True])])
    def test_parametros_invalidos_400(self, client, h, db, mismo_id, extra, ids):
        assert _upload(client, h["fin"], "pdf-firmado", ids, **extra).status_code == 400
        assert db.scalar("SELECT pdf_firmado FROM tabla_todas_solicitudes") is None
