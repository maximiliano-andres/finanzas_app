"""Verifica que la infraestructura de integración usa BD/Redis reales y aislados."""
from tests.integration.conftest import API, data_of


def test_dataset_determinista(db, users):
    assert db.count("roles") == 4
    assert db.count("usuarios") == 6
    assert db.count("usuarios_obras") == 2
    assert users["ana"].rol == "Solicitante"


def test_migracion_renombra_tabla_historico_heredada_conservando_datos(client, db, users, monkeypatch):
    """Instalaciones previas tenían la tabla con un sufijo heredado; init_db() debe renombrarla sin perder filas."""
    import asyncio
    from datetime import datetime
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool
    import app.infrastructure.db.database as database
    from tests.integration.conftest import TEST_DATABASE_URL, solicitud_row

    row = solicitud_row(id_solicitud_origen=77, usuario_id=users["ana"].id)
    row.pop("modificacion_solicitud")
    row["fecha_registro_historico"] = datetime.utcnow()
    db.insert("tabla_historico", row)
    db.execute("ALTER TABLE tabla_historico RENAME TO tabla_historico_legado")

    async def run():
        engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
        monkeypatch.setattr(database, "engine", engine)
        try:
            await database.init_db()
        finally:
            await engine.dispose()

    asyncio.run(run())
    assert db.scalar("SELECT to_regclass('public.tabla_historico_legado')") is None
    assert db.scalar("SELECT id_solicitud_origen FROM tabla_historico") == 77


def test_la_app_responde_contra_la_bd_real(client, h, db):
    r = client.get(f"{API}/empresas", headers=h["admin"])
    assert r.status_code == 200
    nombres = sorted(e["empresa"] for e in data_of(r))
    assert nombres == sorted(x["empresa"] for x in db.all("SELECT empresa FROM empresas"))
