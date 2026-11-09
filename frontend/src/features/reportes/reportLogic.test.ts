import { describe, expect, it } from 'vitest';
import { mapHistorico, mapSolicitud } from '@/lib/solicitud';
import type { SolicitudApi } from '@/types/domain';
import {
  EMPTY_FILTERS, EXCEL_HEADERS, buildExcelAoa, buildExcelRow, dateParts, filterRows, finanzasBase, getMonthName,
  historicoOptions, moneyCell, reportFilename, sortOptions, toComprobanteRows, todasOptions, uniqueNormalized, type ReportRow,
} from './reportLogic';

const raw = (o: Partial<SolicitudApi>): SolicitudApi => ({
  id: 1, solicitante: 'Ana', empresa: 'ANDES', proceso: 'REMUNERACIONES', monto: 1000, ...o,
});
const R = (o: Record<string, unknown>) => ({ id: 1, ...o }) as ReportRow;

describe('EXCEL_HEADERS', () => {
  it('42 columnas en el orden exacto del original', () => {
    expect(EXCEL_HEADERS).toHaveLength(42);
    expect(EXCEL_HEADERS.slice(0, 21)).toEqual([
      'ID', 'SOLICITANTE', 'FECHA EMISION', 'FECHA SOLICITUD', 'FOLIO', 'EMPRESA', 'OBRA', 'PROCESO', 'MONTO', 'ESTADO', 'REVISO',
      'FECHA APROBACION', 'MES DE PROCESO', 'AÑO', 'CUENTA CONTABLE', 'AUXILIAR', 'FECHA DE PAGO', 'UNIDAD DE NEGOCIO', 'GLOSA',
      'OBSERVACIONES', 'OBSERVACIONES DEVOLUCION',
    ]);
    expect(EXCEL_HEADERS.slice(21, 25)).toEqual(['FOLIO UNO', 'MONTO FOLIO UNO', 'PDF FOLIO UNO', 'FORMA DE PAGO FOLIO UNO']);
    expect(EXCEL_HEADERS.slice(37, 41)).toEqual(['FOLIO CINCO', 'MONTO FOLIO CINCO', 'PDF FOLIO CINCO', 'FORMA DE PAGO FOLIO CINCO']);
    expect(EXCEL_HEADERS[41]).toBe('TIPO SOLICITUD');
  });
});

describe('buildExcelRow', () => {
  it('histórico: CUENTA CONTABLE y OBSERVACIONES DEVOLUCION ya no quedan en blanco', () => {
    const h = mapHistorico(raw({ cuenta_contable: '211310', observaciones_devolucion: 'Devuelto', anio: 2025, mes_de_proceso: 'ENERO', estado: 'PAGADO' }));
    const row = buildExcelRow(h as unknown as ReportRow);
    expect(row).toHaveLength(42);
    expect(row[EXCEL_HEADERS.indexOf('CUENTA CONTABLE')]).toBe('211310');
    expect(row[EXCEL_HEADERS.indexOf('OBSERVACIONES DEVOLUCION')]).toBe('Devuelto');
  });
  it('solicitud: formatos, PDFs, montos, valores por defecto', () => {
    const s = mapSolicitud(raw({
      fecha_solicitud: '2025-03-01', fecha_aprobacion: '2025-03-02', folio: 'F1', folio_uno: 'F1', monto_por_folio_uno: 1000,
      pdf_folio_uno: 'doc_pdf/sub/FOLIO_F1.pdf', forma_pago_folio_uno: 'DEPOSITO', tipo_solicitud: null,
    }));
    const row = buildExcelRow({ ...(s as unknown as ReportRow), tipo_solicitud: undefined });
    expect(row[3]).toBe(new Date('2025-03-01T12:00:00').toLocaleDateString('es-CL'));
    expect(row[11]).not.toBe('-');
    expect(row[8]).toEqual({ v: 1000, t: 'n', z: '$#,##0' });
    expect(row.slice(21, 25)).toEqual(['F1', { v: 1000, t: 'n', z: '$#,##0' }, 'FOLIO_F1.pdf', 'DEPOSITO']);
    expect(row.slice(25, 29)).toEqual(['-', '-', '-', '-']);
    expect(row[41]).toBe('Solicitud');
    expect(row[2]).toBe('-');
  });
  it('moneyCell', () => {
    expect(moneyCell('')).toBe('-');
    expect(moneyCell(null)).toBe('-');
    expect(moneyCell('abc')).toBe('-');
    expect(moneyCell('12.5')).toEqual({ v: 12.5, t: 'n', z: '$#,##0' });
  });
  it('aoa con cabecera + nombres de archivo', () => {
    const aoa = buildExcelAoa([R({ estado: 'PAGADO' })]);
    expect(aoa[0]).toBe(EXCEL_HEADERS);
    expect(aoa).toHaveLength(2);
    expect(reportFilename('Historico', '2026-01-31')).toBe('Reporte_Historico_2026-01-31.xlsx');
    expect(reportFilename('General', '2026-01-31')).toBe('Reporte_General_2026-01-31.xlsx');
  });
});

describe('fechas y filtros', () => {
  it('dateParts en hora local (sin desfase UTC en el día 1)', () => {
    expect(dateParts('2025-01-01')).toEqual({ year: 2025, month: 1 });
    expect(dateParts('2025-03-01T00:00:00')).toEqual({ year: 2025, month: 3 });
    expect(dateParts('2024-12-31')).toEqual({ year: 2024, month: 12 });
    expect(dateParts('')).toBeNull();
    expect(dateParts('xx')).toBeNull();
  });
  it('filtra por año/mes con respaldo de fecha en límites de mes/año', () => {
    const rows = [
      R({ id: 1, fechaProceso: '2025-01-01', estado: 'Pendiente', empresaNombre: 'Andes' }),
      R({ id: 2, fechaProceso: '2024-12-31', estado: 'PAGADO', empresa: 'CORDILLERA' }),
      R({ id: 3, anio: 2025, mesProceso: 'ENERO', estado: 'Aprobado Nivel 1', empresa: 'ANDES' }),
    ];
    expect(filterRows(rows, { ...EMPTY_FILTERS, year: '2025' }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, month: '1' }).map((r) => r.id)).toEqual([1]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, month: '12' }).map((r) => r.id)).toEqual([2]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, month: 'enero' }).map((r) => r.id)).toEqual([3]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, status: 'APROBADO NIVEL 1' }).map((r) => r.id)).toEqual([3]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, company: 'andes' }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterRows(rows, EMPTY_FILTERS)).toHaveLength(3);
  });
  it('finanzasBase solo PAGADO/RECEPCIONADO', () => {
    expect(finanzasBase([R({ estado: 'pagado' }), R({ estado: 'RECEPCIONADO' }), R({ estado: 'PENDIENTE' })])).toHaveLength(2);
  });
});

describe('opciones de filtros', () => {
  it('dedup sin mayúsculas, orden numérico/alfabético, sin "UNDEFINED"', () => {
    expect(uniqueNormalized(['ENERO', 'Enero', ' x ', '', null])).toEqual(['ENERO', 'x']);
    expect(sortOptions(['10', '2', '1'])).toEqual(['1', '2', '10']);
    const o = historicoOptions([R({ anio: 2025, mesProceso: 'marzo', empresa: 'B' }), R({ anio: 2024, empresa: 'a' })]);
    expect(o.years).toEqual(['2024', '2025']);
    expect(o.months).toEqual(['MARZO']);
    expect(o.companies).toEqual(['a', 'B']);
    expect(o.statuses[0]).toBe('APROBADO FINANZAS');
    expect(o.statuses).toHaveLength(8);
  });
  it('todas: respaldo por fecha local', () => {
    const o = todasOptions([R({ fechaEmision: '2025-01-01' })]);
    expect(o.years).toEqual(['2025']);
    expect(o.months).toEqual(['1']);
    expect(getMonthName('1')).toBe('Enero');
    expect(getMonthName('MARZO')).toBe('MARZO');
  });
});

describe('toComprobanteRows', () => {
  it('añade alias tipo solicitud a registros de histórico', () => {
    const h = mapHistorico(raw({ cuenta_contable: '211310', fecha_solicitud: '2025-02-01' }));
    const [r] = toComprobanteRows([h as unknown as ReportRow]);
    expect(r).toMatchObject({ empresaNombre: 'ANDES', procesoNombre: 'REMUNERACIONES', cuentaContable: '211310', fechaProceso: '2025-02-01' });
  });
});
