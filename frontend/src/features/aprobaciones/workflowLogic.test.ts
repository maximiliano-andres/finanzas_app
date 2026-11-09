import { describe, expect, it } from 'vitest';
import { mapSolicitud, type Solicitud } from '@/lib/solicitud';
import type { SolicitudApi } from '@/types/domain';
import {
  applyFilters, buildMassApprove, buildTransition, canDeleteAprobacion, filterOptions, groupByEmpresaTipo, isAprobacionN1Row,
  isAprobacionN2Row, isFinanzasRow, missingRegistroAutorizacionIds, missingRegistroAutorizacionText, needsRegistroAutorizacion,
  pdfFileError, sumMontos, transitionMessage, truncateFilename,
} from './workflowLogic';

const mk = (o: Partial<SolicitudApi>): Solicitud =>
  mapSolicitud({ id: 1, solicitante: 'Ana', empresa: 'ANDES', proceso: 'REM', monto: 1000, ...o } as SolicitudApi);

describe('elegibilidad por nivel', () => {
  it('Nivel 1: PENDIENTE en etapa RRHH / Sin Asignar', () => {
    expect(isAprobacionN1Row(mk({ estado: 'PENDIENTE', reviso: 'Jefe de Recursos Humanos' }))).toBe(true);
    expect(isAprobacionN1Row(mk({ estado: 'PENDIENTE', reviso: null }))).toBe(true);
    expect(isAprobacionN1Row(mk({ estado: 'ESPERANDO', reviso: 'Jefe de Recursos Humanos' }))).toBe(false);
    expect(isAprobacionN1Row(mk({ estado: 'APROBADO NIVEL 1', reviso: 'Jefe de Recursos Humanos' }))).toBe(false);
    expect(isAprobacionN1Row(mk({ estado: 'PENDIENTE', reviso: 'Subgerente de Capital Humano' }))).toBe(false);
  });
  it('Nivel 2: etapa Subgerente con APROBADO NIVEL 1 o PENDIENTE', () => {
    expect(isAprobacionN2Row(mk({ estado: 'APROBADO NIVEL 1', reviso: 'Subgerente de Capital Humano' }))).toBe(true);
    expect(isAprobacionN2Row(mk({ estado: 'PENDIENTE', reviso: 'Subgerente de Capital Humano' }))).toBe(true);
    expect(isAprobacionN2Row(mk({ estado: 'APROBADO NIVEL 2', reviso: 'Subgerente de Capital Humano' }))).toBe(false);
    expect(isAprobacionN2Row(mk({ estado: 'APROBADO NIVEL 1', reviso: 'Jefe de Finanzas' }))).toBe(false);
  });
  it('Finanzas: etapa Jefe de Finanzas / Recepcionado con estados N1/N2/AF/RECEPCIONADO', () => {
    expect(isFinanzasRow(mk({ estado: 'APROBADO NIVEL 2', reviso: 'Jefe de Finanzas' }))).toBe(true);
    expect(isFinanzasRow(mk({ estado: 'APROBADO FINANZAS', reviso: 'Jefe de Finanzas' }))).toBe(true);
    expect(isFinanzasRow(mk({ estado: 'RECEPCIONADO', reviso: 'Recepcionado' }))).toBe(true);
    expect(isFinanzasRow(mk({ estado: 'PENDIENTE', reviso: 'Jefe de Finanzas' }))).toBe(false);
    expect(isFinanzasRow(mk({ estado: 'APROBADO NIVEL 2', reviso: 'Subgerente de Capital Humano' }))).toBe(false);
  });
  it('Eliminar visible solo para Pendiente / Aprobado Nivel 1 normalizados', () => {
    expect(canDeleteAprobacion(mk({ estado: 'PENDIENTE' }))).toBe(true);
    expect(canDeleteAprobacion(mk({ estado: 'APROBADO NIVEL 1' }))).toBe(true);
    expect(canDeleteAprobacion(mk({ estado: 'RECHAZADO' }))).toBe(false);
  });
});

describe('agrupación y filtros', () => {
  const rows = [
    mk({ id: 1, empresa: 'zeta', tipo_solicitud: 'Recepcionado', anio: 2024, mes_de_proceso: 'MARZO', fecha_de_pago: '2024-03-10' }),
    mk({ id: 2, empresa: 'Álamo', anio: 2025, mes_de_proceso: 'ENERO', fecha_de_pago: '2025-01-05' }),
    mk({ id: 3, empresa: 'zeta', anio: 2025, mes_de_proceso: 'ENERO', fecha_de_pago: '2025-01-05' }),
    mk({ id: 4, empresa: 'zeta', anio: 2024, mes_de_proceso: 'ENERO' }),
  ];
  it('ordena empresas (es, base), Mis Solicitudes primero y filas en orden inverso', () => {
    const g = groupByEmpresaTipo(rows);
    expect(g.map((x) => [x.empresa, x.tipo, x.rows.map((r) => r.id)])).toEqual([
      ['Álamo', 'Mis Solicitudes', [2]],
      ['zeta', 'Mis Solicitudes', [4, 3]],
      ['zeta', 'Recepcionado', [1]],
    ]);
  });
  it('opciones y filtros', () => {
    const o = filterOptions(rows);
    expect(o.anios).toEqual(['2025', '2024']);
    expect(o.meses).toEqual(['ENERO', 'MARZO']);
    expect(o.pagos).toContain('-');
    expect(applyFilters(rows, { anio: '2025', mes: 'todos', pago: 'todos' }).map((r) => r.id)).toEqual([2, 3]);
    expect(applyFilters(rows, { anio: 'todos', mes: 'MARZO', pago: 'todos' }).map((r) => r.id)).toEqual([1]);
  });
  it('suma montos y trunca nombres', () => {
    expect(sumMontos([mk({ monto: 1000 }), mk({ monto: 2500 })])).toBe(3500);
    expect(truncateFilename('PDF_autorizaciones/autorizacion_12_abcdef.pdf')).toEqual({ full: 'autorizacion_12_abcdef.pdf', short: 'autorizacion...' });
    expect(truncateFilename('a/b.pdf').short).toBe('b.pdf');
  });
});

describe('payloads de transición', () => {
  it('aprobar desde RRHH → APROBADO NIVEL 1 / Subgerente', () => {
    const s = mk({ reviso: 'Jefe de Recursos Humanos' });
    expect(buildTransition(s, 'aprobar', 'ok')).toEqual({ observaciones_devolucion: 'ok', modificacion_solicitud: false, estado: 'APROBADO NIVEL 1', reviso: 'Subgerente de Capital Humano' });
    expect(transitionMessage(s, 'aprobar').msg).toBe('Solicitud aprobada Nivel 1 y enviada a Gerencia');
  });
  it('aprobar desde Subgerente → APROBADO NIVEL 2 / Jefe de Finanzas', () => {
    const s = mk({ reviso: 'Subgerente de Capital Humano' });
    expect(buildTransition(s, 'aprobar', '')).toMatchObject({ estado: 'APROBADO NIVEL 2', reviso: 'Jefe de Finanzas' });
    expect(transitionMessage(s, 'aprobar').msg).toBe('Solicitud aprobada Nivel 2 y enviada a Jefe de Finanzas');
  });
  it('devolver según etapa (T6/T7/T8)', () => {
    expect(buildTransition(mk({ reviso: 'Jefe de Finanzas' }), 'devolver', 'x')).toEqual({ observaciones_devolucion: 'x', modificacion_solicitud: true, estado: 'APROBADO NIVEL 1', reviso: 'Subgerente de Capital Humano' });
    expect(buildTransition(mk({ reviso: 'Subgerente de Capital Humano' }), 'devolver', '')).toMatchObject({ estado: 'PENDIENTE', reviso: 'Jefe de Recursos Humanos', modificacion_solicitud: true });
    expect(buildTransition(mk({ reviso: null }), 'devolver', '')).toMatchObject({ estado: 'RECHAZADO', reviso: 'Sin Asignar', modificacion_solicitud: true });
  });
  it('finanzas aprobar_n2 / aprobar_finanzas', () => {
    expect(buildTransition(mk({}), 'aprobar_n2', 'c')).toMatchObject({ estado: 'APROBADO NIVEL 2', reviso: 'Jefe de Finanzas', modificacion_solicitud: false });
    expect(buildTransition(mk({}), 'aprobar_finanzas', 'c')).toMatchObject({ estado: 'APROBADO FINANZAS', reviso: 'Jefe de Finanzas' });
  });
  it('aprobación masiva', () => {
    expect(buildMassApprove(mk({ reviso: 'Jefe de Recursos Humanos' }), 1)).toEqual({ observaciones_devolucion: 'Aprobación masiva', modificacion_solicitud: false, estado: 'APROBADO NIVEL 1', reviso: 'Subgerente de Capital Humano' });
    expect(buildMassApprove(mk({ reviso: 'Jefe de Recursos Humanos' }), 2)).toMatchObject({ estado: 'APROBADO NIVEL 2', reviso: 'Jefe de Finanzas' });
  });
});

describe('prerrequisitos PDF', () => {
  it('aprobación individual requiere registro en Recepcionado APROBADO NIVEL 1', () => {
    expect(needsRegistroAutorizacion(mk({ tipo_solicitud: 'Recepcionado', estado: 'APROBADO NIVEL 1' }))).toBe(true);
    expect(needsRegistroAutorizacion(mk({ tipo_solicitud: 'Recepcionado', estado: 'APROBADO NIVEL 1', pdf_registro_autorizacion: 'x.pdf' }))).toBe(false);
    expect(needsRegistroAutorizacion(mk({ tipo_solicitud: 'Recepcionado', estado: 'PENDIENTE' }))).toBe(false);
    expect(needsRegistroAutorizacion(mk({ estado: 'APROBADO NIVEL 1' }))).toBe(false);
  });
  it('masiva Nivel 2 lista los Recepcionado sin PDF', () => {
    const rows = [mk({ id: 7, tipo_solicitud: 'Recepcionado' }), mk({ id: 8 }), mk({ id: 9, tipo_solicitud: 'Recepcionado', pdf_registro_autorizacion: 'a' })];
    expect(missingRegistroAutorizacionIds(rows, 2)).toEqual([7]);
    expect(missingRegistroAutorizacionIds(rows, 1)).toEqual([]);
    expect(missingRegistroAutorizacionText([7, 10])).toContain('Hay (2) solicitude(s) que no tienen el "PDF Registro Autorización".El ID(s) son: #7, #10.');
  });
  it('validación de archivo', () => {
    expect(pdfFileError({ type: 'image/png', size: 1 }, true)).toBe('type');
    expect(pdfFileError({ type: 'application/pdf', size: 11 * 1024 * 1024 }, true)).toBe('size');
    expect(pdfFileError({ type: 'application/pdf', size: 11 * 1024 * 1024 }, false)).toBeNull();
  });
});
