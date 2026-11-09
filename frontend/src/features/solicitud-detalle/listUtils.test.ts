import { describe, expect, it } from 'vitest';
import { datePart, groupBy, matchesPeriodo, periodoOptions, sumMonto, toMonto } from './listUtils';
import { formatDate } from '@/lib/format';
import { getFolioSubRows } from '@/lib/solicitud';
import { sol } from './__fixtures__/factories';

describe('periodoOptions / matchesPeriodo', () => {
  const rows = [
    { anio: 2024, mesProceso: 'MARZO', fechaPago: '2024-03-30' },
    { anio: 2025, mesProceso: 'ENERO', fechaPago: null },
    { anio: null, mesProceso: 'MARZO', fechaPago: '2024-03-30' },
  ];
  it('años desc sin nulos, meses en orden calendario, pagos únicos', () => {
    const o = periodoOptions(rows);
    expect(o.anios).toEqual([2025, 2024]);
    expect(o.meses).toEqual(['ENERO', 'MARZO']);
    expect(o.pagos).toEqual(['-', formatDate('2024-03-30')].sort());
  });
  it('filtra', () => {
    expect(rows.filter((r) => matchesPeriodo(r, { anio: '2024', mes: 'todos', pago: 'todos' }))).toHaveLength(1);
    expect(rows.filter((r) => matchesPeriodo(r, { anio: 'todos', mes: 'MARZO', pago: formatDate('2024-03-30') }))).toHaveLength(2);
    expect(rows.filter((r) => matchesPeriodo(r, { anio: 'todos', mes: 'todos', pago: '-' }))).toHaveLength(1);
  });
});

describe('montos y agrupación', () => {
  it('toMonto tolera strings', () => {
    expect(toMonto('$ 1.000')).toBe(1);
    expect(toMonto('abc')).toBe(0);
    expect(sumMonto([{ monto: 10 }, { monto: '5' }, { monto: null }])).toBe(15);
    expect(sumMonto([])).toBe(0);
  });
  it('groupBy mantiene orden de aparición', () => {
    expect(groupBy(['b1', 'a1', 'b2'], (s) => s[0])).toEqual([['b', ['b1', 'b2']], ['a', ['a1']]]);
  });
  it('datePart', () => {
    expect(datePart('2025-03-11T23:30:00')).toBe('2025-03-11');
    expect(datePart(null)).toBeNull();
    expect(datePart('basura')).toBeNull();
  });
});

describe('multi-folio sub-filas', () => {
  it('una sub-fila por folio presente', () => {
    const s = sol({ folio_uno: 'F1', monto_por_folio_uno: 10, folio_dos: 'F2', monto_por_folio_dos: 20, folio_cuatro: 'F4' });
    expect(getFolioSubRows(s).map((r) => r.folio)).toEqual(['F1', 'F2', 'F4']);
    expect(s.folio).toBe('MÚLTIPLES FOLIOS');
  });
});
