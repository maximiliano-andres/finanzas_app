import { describe, expect, it } from 'vitest';
import { agruparPorEmpresaYTipo, misSolicitudesVisibles, puedeEnviar } from './misSolicitudesLogic';
import { sol, user } from '@/features/solicitud-detalle/__fixtures__/factories';

describe('misSolicitudesVisibles', () => {
  const esp = sol({ estado: 'ESPERANDO', usuario_id: 1 });
  const rech = sol({ estado: 'RECHAZADO', usuario_id: 1 });
  const pend = sol({ estado: 'PENDIENTE', usuario_id: 1 });
  const ajena = sol({ estado: 'ESPERANDO', usuario_id: 7, solicitante: 'Otro' });
  const nula = sol({ estado: null, usuario_id: 1 });
  const rows = [esp, rech, pend, ajena, nula];

  it('dueño ve solo RECHAZADO/ESPERANDO propias (PENDIENTE y null excluidos)', () => {
    expect(misSolicitudesVisibles(rows, user())).toEqual([esp, rech]);
  });
  it('admin y RRHH ven las de todos', () => {
    expect(misSolicitudesVisibles(rows, user({ id: 99, nombre: 'X', rol: 'Administrador' }))).toEqual([esp, rech, ajena]);
    expect(misSolicitudesVisibles(rows, user({ id: 99, nombre: 'X', rol: 'Aprobador', cargo: 'Subgerente de Capital Humano' }))).toHaveLength(3);
  });
  it('finanzas NO es alta visibilidad aquí (solo propias)', () => {
    expect(misSolicitudesVisibles(rows, user({ id: 99, nombre: 'X', rol: 'Jefe de Finanzas' }))).toEqual([]);
  });
  it('id estricto: id string del backend se parsea a número', () => {
    expect(misSolicitudesVisibles([sol({ usuario_id: '1', solicitante: 'Z' })], user())).toHaveLength(1);
  });
});

describe('agruparPorEmpresaYTipo', () => {
  it('agrupa por empresa × tipo en orden, ignora tipos desconocidos', () => {
    const rows = [
      sol({ empresa: 'B Corp', tipo_solicitud: 'Recepcionado' }),
      sol({ empresa: 'A SA' }),
      sol({ empresa: 'B Corp' }),
      sol({ empresa: 'A SA', tipo_solicitud: 'Otro' }),
    ];
    const g = agruparPorEmpresaYTipo(rows);
    expect(g.map((x) => x.cardId)).toEqual(['b-corp-solicitudes', 'b-corp-recepcionado', 'a-sa-solicitudes']);
    expect(g[2].rows).toHaveLength(1);
  });
  it('vacío', () => expect(agruparPorEmpresaYTipo([])).toEqual([]));
});

describe('puedeEnviar', () => {
  it('requiere ≥1 y todas Esperando', () => {
    expect(puedeEnviar([])).toBe(false);
    expect(puedeEnviar([{ estado: 'Esperando' }, { estado: 'Esperando' }])).toBe(true);
    expect(puedeEnviar([{ estado: 'Esperando' }, { estado: 'Rechazado' }])).toBe(false);
  });
});
