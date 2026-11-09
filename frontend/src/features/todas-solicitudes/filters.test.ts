import { describe, expect, it } from 'vitest';
import { CRITERIOS_VACIOS, ESTADO_OPTIONS, filtrarSolicitudes, visiblesTodas } from './filters';
import { normalizeEstado } from '@/lib/solicitud';
import { sol, user } from '@/features/solicitud-detalle/__fixtures__/factories';

const c = (p: Partial<typeof CRITERIOS_VACIOS>) => ({ ...CRITERIOS_VACIOS, ...p });

describe('visiblesTodas', () => {
  const propia = sol({ usuario_id: 1 });
  const ajena = sol({ usuario_id: 2, solicitante: 'Otro' });
  it('solicitante solo propias; aprobador y admin todas', () => {
    expect(visiblesTodas([propia, ajena], user())).toEqual([propia]);
    expect(visiblesTodas([propia, ajena], user({ rol: 'Aprobador' }))).toHaveLength(2);
    expect(visiblesTodas([propia, ajena], user({ rol: 'Administrador' }))).toHaveLength(2);
  });
});

describe('filtrarSolicitudes', () => {
  const a = sol({ id: 101, solicitante: 'Juan Soto', empresa: 'Minera Norte', proceso: 'Finiquitos', estado: 'APROBADO NIVEL 2', monto: 5000, fecha_solicitud: '2025-03-10', fecha_de_pago: '2025-04-01' });
  const b = sol({ id: 202, solicitante: 'Ana', empresa: 'Sur', proceso: 'Bonos', estado: 'RECHAZADO', monto: 100, fecha_solicitud: '2025-03-11T23:30:00', fecha_de_pago: null });
  const rows = [a, b];

  it('sin criterios devuelve todo', () => expect(filtrarSolicitudes(rows, CRITERIOS_VACIOS)).toEqual(rows));
  it('texto por id, solicitante, empresa y proceso', () => {
    expect(filtrarSolicitudes(rows, c({ texto: '10' }))).toEqual([a]);
    expect(filtrarSolicitudes(rows, c({ texto: ' NORTE ' }))).toEqual([a]);
    expect(filtrarSolicitudes(rows, c({ texto: 'bono' }))).toEqual([b]);
  });
  it('todas las opciones de estado coinciden con valores normalizados (bug #7)', () => {
    for (const raw of ['ESPERANDO', 'PENDIENTE', 'APROBADO NIVEL 1', 'APROBADO NIVEL 2', 'APROBADO FINANZAS', 'RECHAZADO', 'PAGADO']) {
      expect(ESTADO_OPTIONS.map((o) => o.value)).toContain(normalizeEstado(raw));
    }
    expect(filtrarSolicitudes(rows, c({ estado: 'Aprobado nivel 2' }))).toEqual([a]);
  });
  it('rango de fechas inclusivo en el extremo final', () => {
    expect(filtrarSolicitudes(rows, c({ fechaDesde: '2025-03-10', fechaHasta: '2025-03-10' }))).toEqual([a]);
    expect(filtrarSolicitudes(rows, c({ fechaHasta: '2025-03-11' }))).toEqual(rows);
    expect(filtrarSolicitudes(rows, c({ fechaDesde: '2025-03-11' }))).toEqual([b]);
  });
  it('fecha de pago: registros sin fecha se excluyen cuando hay rango', () => {
    expect(filtrarSolicitudes(rows, c({ fechaPagoDesde: '2025-01-01' }))).toEqual([a]);
    expect(filtrarSolicitudes(rows, c({ fechaPagoHasta: '2025-04-01' }))).toEqual([a]);
  });
  it('monto min/max', () => {
    expect(filtrarSolicitudes(rows, c({ montoMin: '100', montoMax: '100' }))).toEqual([b]);
    expect(filtrarSolicitudes(rows, c({ montoMin: 'abc' }))).toEqual(rows);
  });
  it('lista vacía', () => expect(filtrarSolicitudes([], c({ texto: 'x' }))).toEqual([]));
});
