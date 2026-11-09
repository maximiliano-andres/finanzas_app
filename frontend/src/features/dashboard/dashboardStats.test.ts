import { describe, expect, it } from 'vitest';
import { dashboardSolicitudes, dashboardStats, recientes } from './dashboardStats';
import { sol, user } from '@/features/solicitud-detalle/__fixtures__/factories';

describe('dashboardSolicitudes', () => {
  const propia = sol({ usuario_id: 1 });
  const otraPorNombre = sol({ usuario_id: 9, solicitante: 'ANA PEREZ' });
  const ajena = sol({ usuario_id: 9, solicitante: 'Otro' });
  const rows = [propia, otraPorNombre, ajena];

  it('alta visibilidad ve todas (admin, RRHH por cargo, finanzas)', () => {
    expect(dashboardSolicitudes(rows, user({ rol: 'Administrador' }))).toHaveLength(3);
    expect(dashboardSolicitudes(rows, user({ rol: 'Aprobador', cargo: 'Jefe de Recursos Humanos' }))).toHaveLength(3);
    expect(dashboardSolicitudes(rows, user({ rol: 'Jefe de Finanzas' }))).toHaveLength(3);
  });
  it('solicitante ve propias por id o nombre (case-insensitive)', () => {
    expect(dashboardSolicitudes(rows, user())).toEqual([propia, otraPorNombre]);
  });
  it('otros roles no ven nada', () => {
    expect(dashboardSolicitudes(rows, user({ rol: 'Aprobador', cargo: 'Otro' }))).toEqual([]);
  });
});

describe('dashboardStats', () => {
  it('cuenta según reglas exactas', () => {
    const rows = [
      sol({ estado: 'PENDIENTE' }), sol({ estado: 'ESPERANDO' }), sol({ estado: null }),
      sol({ estado: 'APROBADO NIVEL 1' }), sol({ estado: 'APROBADO NIVEL 2' }), sol({ estado: 'APROBADO FINANZAS' }),
      sol({ estado: 'RECEPCIONADO' }), sol({ estado: 'RECHAZADO' }), sol({ estado: 'PAGADO' }),
    ];
    // estado null se normaliza a "Pendiente" → cuenta como pendiente
    expect(dashboardStats(rows)).toEqual({ pendientes: 3, aprobadas: 4, rechazadas: 1, total: 9 });
  });
  it('vacío', () => {
    expect(dashboardStats([])).toEqual({ pendientes: 0, aprobadas: 0, rechazadas: 0, total: 0 });
    expect(dashboardStats([{ estado: null }])).toEqual({ pendientes: 0, aprobadas: 0, rechazadas: 0, total: 1 });
  });
});

describe('recientes', () => {
  it('últimas 5 invertidas', () => {
    expect(recientes([1, 2, 3, 4, 5, 6, 7])).toEqual([7, 6, 5, 4, 3]);
    expect(recientes([])).toEqual([]);
  });
});
