import { describe, expect, it } from 'vitest';
import { filtrarRecepcionado, hayEditables, pdfNames, recepcionadosVisibles, toggleEstado } from './recepcionadoLogic';
import { PERIODO_TODOS } from '@/features/solicitud-detalle/listUtils';
import { rec, user } from '@/features/solicitud-detalle/__fixtures__/factories';

describe('recepcionadosVisibles', () => {
  const propio = rec({ usuario_id: 1 });
  const propioPagado = rec({ usuario_id: 1, estado: 'PAGADO' });
  const ajeno = rec({ usuario_id: 5, solicitante: 'Otro' });
  const rows = [propio, propioPagado, ajeno];
  it('Solicitante: propios y no PAGADO', () => expect(recepcionadosVisibles(rows, user())).toEqual([propio]));
  it('otros roles ven todo', () => expect(recepcionadosVisibles(rows, user({ rol: 'Aprobador' }))).toEqual(rows));
});

describe('filtrarRecepcionado', () => {
  const r = rec({ estado: 'RECEPCIONADO', anio: 2025, mes_de_proceso: 'ENERO' });
  const p = rec({ estado: 'PAGADO', anio: 2024, mes_de_proceso: 'MARZO' });
  const otro = rec({ estado: 'PENDIENTE', anio: 2025 });
  const rows = [r, p, otro];
  it('checkboxes de estado; otros estados siempre pasan', () => {
    expect(filtrarRecepcionado(rows, { ...PERIODO_TODOS, estados: { recepcionado: true, pagado: false } })).toEqual([r, otro]);
    expect(filtrarRecepcionado(rows, { ...PERIODO_TODOS, estados: { recepcionado: false, pagado: true } })).toEqual([p, otro]);
  });
  it('año y mes', () => {
    expect(filtrarRecepcionado(rows, { anio: '2025', mes: 'ENERO', pago: 'todos', estados: { recepcionado: true, pagado: true } })).toEqual([r]);
  });
});

describe('toggleEstado / hayEditables / pdfNames', () => {
  it('impide desmarcar ambos', () => {
    expect(toggleEstado({ recepcionado: true, pagado: false }, 'recepcionado', false)).toBeNull();
    expect(toggleEstado({ recepcionado: true, pagado: true }, 'pagado', false)).toEqual({ recepcionado: true, pagado: false });
  });
  it('hayEditables', () => {
    expect(hayEditables([rec({ estado: 'PAGADO' })])).toBe(false);
    expect(hayEditables([rec({ estado: 'PAGADO' }), rec()])).toBe(true);
    expect(hayEditables([])).toBe(false);
  });
  it('trunca nombres > 15', () => {
    expect(pdfNames('PDF_firmados/abcdefghijklmnop.pdf')).toEqual({ full: 'abcdefghijklmnop.pdf', short: 'abcdefghijkl...' });
    expect(pdfNames('x/corto.pdf').short).toBe('corto.pdf');
  });
});
