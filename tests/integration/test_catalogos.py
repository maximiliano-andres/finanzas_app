"""
Catálogos: /empresas, /procesos, /procesos_auxiliares (CRUD) y GET /roles, más la utilidad de
paginación compartida por todos los listados.
"""
import pytest

from tests.integration.conftest import API, data_of, message_of


class TestEmpresas:
    def test_crear_normaliza_mayusculas_y_persiste(self, client, h, db):
        r = client.post(f"{API}/empresas", json={"empresa": "nueva sa", "codigo": "9399000"}, headers=h["admin"])
        assert r.status_code == 200
        assert db.one("SELECT empresa, codigo FROM empresas WHERE codigo='9399000'") == {"empresa": "NUEVA SA", "codigo": "9399000"}

    def test_nombre_duplicado_400(self, client, h, db):
        assert client.post(f"{API}/empresas", json={"empresa": "andes", "codigo": "1"*7}, headers=h["admin"]).status_code == 400
        assert db.count("empresas") == 2

    def test_codigo_duplicado_400(self, client, h, db):
        """HALLAZGO H-11: solo se validaba el nombre; el código duplicado terminaba en 500 genérico."""
        r = client.post(f"{API}/empresas", json={"empresa": "OTRA", "codigo": "1001000"}, headers=h["admin"])
        assert r.status_code == 400
        assert db.count("empresas") == 2

    def test_modificar_a_valores_de_otra_empresa_400(self, client, h, db):
        cordillera = db.scalar("SELECT id FROM empresas WHERE empresa='CORDILLERA'")
        r = client.put(f"{API}/empresas/{cordillera}", json={"empresa": "ANDES", "codigo": "2001000"}, headers=h["admin"])
        assert r.status_code == 400
        assert db.scalar("SELECT empresa FROM empresas WHERE id=%s", (cordillera,)) == "CORDILLERA"

    def test_modificar_ok_y_404(self, client, h, db):
        cordillera = db.scalar("SELECT id FROM empresas WHERE empresa='CORDILLERA'")
        assert client.put(f"{API}/empresas/{cordillera}", json={"empresa": "CORDILLERA SPA", "codigo": "2001000"}, headers=h["admin"]).status_code == 200
        assert db.scalar("SELECT empresa FROM empresas WHERE id=%s", (cordillera,)) == "CORDILLERA SPA"
        assert client.put(f"{API}/empresas/999", json={"empresa": "X Y", "codigo": "123"}, headers=h["admin"]).status_code == 404

    def test_eliminar_ok_y_404(self, client, h, db):
        cordillera = db.scalar("SELECT id FROM empresas WHERE empresa='CORDILLERA'")
        assert client.delete(f"{API}/empresas/{cordillera}", headers=h["admin"]).status_code == 200
        assert db.count("empresas") == 1
        assert client.delete(f"{API}/empresas/{cordillera}", headers=h["admin"]).status_code == 404

    @pytest.mark.parametrize("body", [{"empresa": "A", "codigo": "123"}, {"empresa": "OK SA", "codigo": "1" * 21}, {"empresa": "OK SA"}])
    def test_validacion_422(self, client, h, body):
        assert client.post(f"{API}/empresas", json=body, headers=h["admin"]).status_code == 422

    @pytest.mark.parametrize("metodo", ["post", "put", "delete"])
    def test_no_admin_403(self, client, h, db, metodo):
        kw = {"json": {"empresa": "HACK SA", "codigo": "666"}} if metodo != "delete" else {}
        url = f"{API}/empresas" if metodo == "post" else f"{API}/empresas/1"
        assert getattr(client, metodo)(url, headers=h["ana"], **kw).status_code == 403
        assert db.count("empresas") == 2 and db.count("empresas", "empresa='HACK SA'") == 0


class TestProcesos:
    body = {"nombre": "finiquito", "proceso": "proceso finiquito", "cuenta_objeto": "211310", "auxiliar": "0010", "estado": "ACTIVO"}

    def test_crear_persiste_en_mayusculas(self, client, h, db):
        assert client.post(f"{API}/procesos", json=self.body, headers=h["admin"]).status_code == 200
        assert db.one("SELECT nombre, proceso FROM procesos WHERE nombre='FINIQUITO'") == {"nombre": "FINIQUITO", "proceso": "PROCESO FINIQUITO"}

    def test_duplicado_400(self, client, h, db):
        assert client.post(f"{API}/procesos", json={**self.body, "nombre": "remuneraciones"}, headers=h["admin"]).status_code == 400
        assert db.count("procesos") == 1

    def test_error_de_bd_no_filtra_sql(self, client, h, db):
        """HALLAZGO H-12: el servicio devolvía str(e) del driver (SQL, nombres de columnas) en el 400."""
        r = client.post(f"{API}/procesos", json={**self.body, "nombre": "X" * 150}, headers=h["admin"])
        assert r.status_code == 400
        assert "INSERT" not in r.text and "procesos." not in r.text and "asyncpg" not in r.text
        assert db.count("procesos") == 1

    def test_estado_invalido_422(self, client, h):
        assert client.post(f"{API}/procesos", json={**self.body, "estado": "BORRADO"}, headers=h["admin"]).status_code == 422

    def test_modificar_y_eliminar(self, client, h, db):
        pid = db.scalar("SELECT id FROM procesos")
        r = client.put(f"{API}/procesos/{pid}", json={**self.body, "estado": "INACTIVO"}, headers=h["admin"])
        assert r.status_code == 200 and db.scalar("SELECT estado FROM procesos WHERE id=%s", (pid,)) == "INACTIVO"
        assert client.delete(f"{API}/procesos/{pid}", headers=h["admin"]).status_code == 200
        assert db.count("procesos") == 0
        assert client.delete(f"{API}/procesos/{pid}", headers=h["admin"]).status_code == 404
        assert client.put(f"{API}/procesos/{pid}", json=self.body, headers=h["admin"]).status_code == 404

    def test_no_admin_403(self, client, h, db):
        assert client.post(f"{API}/procesos", json=self.body, headers=h["fin"]).status_code == 403
        assert client.delete(f"{API}/procesos/1", headers=h["ana"]).status_code == 403
        assert db.count("procesos") == 1


class TestProcesosAuxiliares:
    body = {"numero": "N-9", "detalle": "OBRA ESTE", "auxiliar": "090", "estado": "ACTIVO"}

    def test_solicitante_solo_ve_sus_obras(self, client, h):
        assert [o["detalle"] for o in data_of(client.get(f"{API}/procesos_auxiliares", headers=h["ana"]))] == ["OBRA NORTE"]
        assert data_of(client.get(f"{API}/procesos_auxiliares", headers=h["sinobra"])) == []
        assert len(data_of(client.get(f"{API}/procesos_auxiliares", headers=h["admin"]))) == 2

    @pytest.mark.parametrize("dup", [{"numero": "N-1"}, {"detalle": "OBRA NORTE"}, {"auxiliar": "010"}])
    def test_crear_duplicado_400(self, client, h, db, dup):
        assert client.post(f"{API}/procesos_auxiliares", json={**self.body, **dup}, headers=h["admin"]).status_code == 400
        assert db.count("procesos_auxiliares") == 2

    def test_crear_y_modificar(self, client, h, db):
        r = client.post(f"{API}/procesos_auxiliares", json=self.body, headers=h["admin"])
        assert r.status_code == 200
        new_id = data_of(r)["id"]
        assert client.put(f"{API}/procesos_auxiliares/{new_id}", json={**self.body, "detalle": "OBRA OESTE"}, headers=h["admin"]).status_code == 200
        assert db.scalar("SELECT detalle FROM procesos_auxiliares WHERE id=%s", (new_id,)) == "OBRA OESTE"

    def test_modificar_a_duplicado_400_sin_cambios(self, client, h, db):
        r = client.put(f"{API}/procesos_auxiliares/2", json={**self.body, "detalle": "OBRA NORTE"}, headers=h["admin"])
        assert r.status_code == 400
        assert db.scalar("SELECT detalle FROM procesos_auxiliares WHERE id=2") == "OBRA SUR"

    def test_eliminar_quita_acceso_de_usuarios_a_la_obra(self, client, h, db):
        """Efecto secundario documentado: ON DELETE CASCADE elimina las asignaciones usuario-obra."""
        assert client.delete(f"{API}/procesos_auxiliares/1", headers=h["admin"]).status_code == 200
        assert db.count("usuarios_obras", "obra_id=1") == 0
        assert data_of(client.get(f"{API}/procesos_auxiliares", headers=h["ana"])) == []

    def test_no_admin_403(self, client, h, db):
        assert client.post(f"{API}/procesos_auxiliares", json=self.body, headers=h["ana"]).status_code == 403
        assert client.delete(f"{API}/procesos_auxiliares/1", headers=h["rrhh"]).status_code == 403
        assert db.count("procesos_auxiliares") == 2


def test_roles_lista(client, h):
    assert sorted(r["nombre"] for r in data_of(client.get(f"{API}/roles", headers=h["ana"]))) == [
        "Administrador", "Aprobador", "Responsable Finanzas", "Solicitante"]


class TestPaginacion:
    @pytest.mark.parametrize("qs", ["limit=-1", "offset=-5", "limit=abc"])
    def test_parametros_invalidos_422(self, client, h, qs):
        """HALLAZGO H-13: limit/offset negativos llegaban a PostgreSQL → 500 genérico."""
        assert client.get(f"{API}/empresas?{qs}", headers=h["admin"]).status_code == 422

    def test_limit_offset_y_tope(self, client, h, db):
        for i in range(5):
            db.execute("INSERT INTO empresas (empresa, codigo) VALUES (%s, %s)", (f"E{i}", f"C{i}"))
        assert len(data_of(client.get(f"{API}/empresas?limit=3", headers=h["admin"]))) == 3
        assert len(data_of(client.get(f"{API}/empresas?limit=3&offset=6", headers=h["admin"]))) == 1
        assert len(data_of(client.get(f"{API}/empresas?limit=100000", headers=h["admin"]))) == 7

