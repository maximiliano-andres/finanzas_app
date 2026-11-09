import { describe, expect, it } from 'vitest';
import { mapSolicitud, type Solicitud } from '@/lib/solicitud';
import type { SolicitudApi } from '@/types/domain';
import {
  buildRecepcionadoPayload, exportRows, finanzasApproveAction, finanzasRowMode, isFinanzasRestricted, massFinanzasStep,
  soloFinanzasRows, validateProcesarSeleccionadas, validateRecepcion,
} from './finanzasLogic';
import { buildComprobanteRows, buildComprobanteSheet, comprobanteFilename, type ComprobanteItem } from './comprobanteLogic';

const mk = (o: Partial<SolicitudApi>): Solicitud =>
  mapSolicitud({ id: 1, solicitante: 'Ana', empresa: 'ANDES SpA', proceso: 'REMUNERACION', monto: 1000, folio: 'F1', ...o } as SolicitudApi);

describe('finanzasLogic', () => {
  it('modo de acciones y candado', () => {
    expect(finanzasRowMode(mk({ estado: 'APROBADO NIVEL 2' }), 'Mis Solicitudes')).toBe('acciones');
    expect(finanzasRowMode(mk({ estado: 'APROBADO FINANZAS' }), 'Mis Solicitudes')).toBe('fase1');
    expect(finanzasRowMode(mk({ estado: 'APROBADO FINANZAS' }), 'Recepcionado')).toBe('fase2');
    expect(finanzasRowMode(mk({ estado: 'RECEPCIONADO' }), 'Recepcionado')).toBe('completado');
    expect(isFinanzasRestricted(mk({ estado: 'APROBADO FINANZAS' }), 'Mis Solicitudes')).toBe(true);
    expect(isFinanzasRestricted(mk({ estado: 'APROBADO FINANZAS' }), 'Recepcionado')).toBe(false);
  });
  it('acción del botón aprobar y del procesamiento masivo', () => {
    expect(finanzasApproveAction(mk({ estado: 'PENDIENTE' }))).toEqual({ accion: 'aprobar_n2', comentario: 'Aprobado automáticamente por Jefe de Finanzas' });
    expect(finanzasApproveAction(mk({ estado: 'APROBADO NIVEL 2' }))?.accion).toBe('aprobar_finanzas');
    expect(finanzasApproveAction(mk({ estado: 'APROBADO FINANZAS' }))).toBeNull();
    expect(massFinanzasStep(mk({ estado: 'APROBADO FINANZAS' }))).toEqual({ kind: 'recepcionar' });
    expect(massFinanzasStep(mk({ estado: 'APROBADO NIVEL 1' }))).toMatchObject({ kind: 'patch', accion: 'aprobar_n2', comentario: 'Aprobado masivamente por Jefe de Finanzas' });
    expect(massFinanzasStep(mk({ estado: 'APROBADO NIVEL 2' }))).toMatchObject({ accion: 'aprobar_finanzas' });
    expect(massFinanzasStep(mk({ estado: 'RECEPCIONADO' }))).toEqual({ kind: 'omitir' });
  });
  it('validaciones de procesamiento', () => {
    const rows = [
      mk({ id: 1, estado: 'APROBADO FINANZAS', folio: '' }),
      mk({ id: 2, estado: 'APROBADO FINANZAS', tipo_solicitud: 'Recepcionado', pdf_firmado: 'x' }),
      mk({ id: 3, estado: 'APROBADO NIVEL 1', tipo_solicitud: 'Recepcionado' }),
      mk({ id: 4, estado: 'APROBADO NIVEL 2' }),
    ];
    const msg = validateProcesarSeleccionadas(rows)!;
    expect(msg).toContain('- Falta Folio en IDs: #1');
    expect(msg).toContain('- Falta PDF Firmado/Autorización (necesarios para recepción) en IDs: #2');
    expect(msg).toContain('- Falta PDF de Autorización (necesario para Nivel 2) en IDs: #3');
    expect(validateProcesarSeleccionadas([rows[3]])).toBeNull();
    expect(validateRecepcion([rows[0], rows[1]])).toBe(
      'No se pueden recepcionar las solicitudes debido a falta de información:\n\n- Falta Folio en IDs: #1\n- Falta PDF Firmado/Autorización en IDs: #2',
    );
  });
  it('alcance de "Aprobación de finanzas" y exportación', () => {
    const all = [
      mk({ id: 1, estado: 'APROBADO FINANZAS' }),
      mk({ id: 2, estado: 'APROBADO FINANZAS', tipo_solicitud: 'Recepcionado' }),
      mk({ id: 3, estado: 'APROBADO NIVEL 2' }),
      mk({ id: 4, estado: 'APROBADO FINANZAS', empresa: 'Otra' }),
    ];
    expect(soloFinanzasRows(all, 'ANDES SpA', 'Mis Solicitudes').map((s) => s.id)).toEqual([1]);
    expect(exportRows(all, 'ANDES SpA').map((s) => s.id)).toEqual([1, 2]);
  });
  it('payload de recepción', () => {
    const p = buildRecepcionadoPayload(mk({ id: 9, estado: 'APROBADO FINANZAS', tipo_solicitud: 'Recepcionado', folio_uno: 'A', monto_por_folio_uno: 500, folio_dos: 'B', pdf_firmado: 'PDF_firmados/f.pdf' }), '2025-01-02');
    expect(p).toMatchObject({
      estado: 'PAGADO', reviso: 'Recepcionado', folio: 'MÚLTIPLES FOLIOS', fecha_emision: '2025-01-02', fecha_aprobacion: '2025-01-02',
      folio_uno: 'A', monto_por_folio_uno: 500, folio_tres: null, pdf_firmado: 'PDF_firmados/f.pdf', id_solicitud_origen: 9,
      tipo_solicitud: 'Recepcionado', modificacion_solicitud: false, empresa: 'ANDES SpA', proceso: 'REMUNERACION',
    });
    expect(buildRecepcionadoPayload(mk({}), 'x').estado).toBe('RECEPCIONADO');
  });
});

describe('comprobante contable', () => {
  const item = (i: number, o: Partial<SolicitudApi> = {}) =>
    mk({ id: i, monto: 100 * i, mes_de_proceso: 'MARZO', anio: 2025, cuenta_contable: '4101', obra: 'Obra X', ...o }) as unknown as ComprobanteItem;

  it('construye filas con fallbacks de UNE y auxiliar', () => {
    const { rows, total } = buildComprobanteRows([item(1), item(2, { empresa: 'Otra', auxiliar: '0099', unidad_de_negocio: null })]);
    expect(rows[0]).toEqual({
      une: '1001000010', cuentaObj: '4101', cuentaAux: '0010', proceso: 'REMUNERACION', obra: 'Obra X', periodo: 'MAR25', monto: 100,
      concatenadoK: '1001000010.4101.0010', glosaN: 'REMUNERACION OBRA X MAR25',
    });
    expect(rows[1].une).toBe('2001000193');
    expect(rows[1].cuentaAux).toBe('0099');
    expect(total).toBe(300);
  });
  it('omite ítems sin monto', () => {
    expect(buildComprobanteRows([item(1, { monto: 0 })]).rows).toHaveLength(0);
  });
  it('acepta registros de histórico (campos crudos)', () => {
    const raw = { id: 5, empresa: 'ANDES', proceso: 'BONO', cuenta_contable: '9', mes_de_proceso: 'ENERO', anio: 2024, monto: 10, fecha_solicitud: '2024-01-15' };
    const { rows } = buildComprobanteRows([raw]);
    expect(rows[0]).toMatchObject({ proceso: 'BONO', cuentaObj: '9', periodo: 'ENE24' });
    const { ws } = buildComprobanteSheet([raw]);
    expect((ws.B13 as { v: string }).v).toBe('ANDES');
    expect(comprobanteFilename([raw])).toBe('COMPROBANTE_5_BONO_ENERO.xlsx');
  });
  it('incluye TODAS las filas (>32) y TOTALES correcto', () => {
    const items = Array.from({ length: 40 }, (_, k) => item(k + 1));
    const { ws, total, rowCount } = buildComprobanteSheet(items);
    expect(rowCount).toBe(40);
    expect(total).toBe((40 * 41 / 2) * 100);
    expect((ws.G57 as { v: number }).v).toBe(4000); // fila 18 + 39
    expect((ws.A59 as { v: string }).v).toBe('PAGADO');
    expect(ws.G60).toMatchObject({ v: total, t: 'n', z: '"$" #,##0' });
    expect((ws.F60 as { v: string }).v).toBe('TOTALES');
    expect((ws.A62 as { v: string }).v).toBe('FINANZAS');
    expect(ws['!ref']).toBe('A1:N64');
  });
  it('cabecera, estilos y anchos', () => {
    const { ws } = buildComprobanteSheet([item(1, { glosa: 'remu obra x mar' })]);
    expect(ws.A1).toMatchObject({ v: 'Andes Servicios S.A.', s: { font: { bold: true, color: { rgb: '000080' }, sz: 14 } } });
    expect((ws.D6 as { v: string }).v).toBe('COMPROBANTE ÚNICO DE CONTABILIDAD');
    expect((ws.B15 as { v: string }).v).toBe('REMU OBRA X MAR');
    expect((ws.H13 as { v: string }).v).toBe('78119320-8');
    expect(ws.A18).toMatchObject({ s: { fill: { fgColor: { rgb: 'FFFF00' } } } });
    expect(ws.K18).toMatchObject({ v: '1001000010.4101.0010', s: { fill: { fgColor: { rgb: '1FADFF' } } } });
    expect(ws.G18).toMatchObject({ v: 100, t: 'n', z: '#,##0' });
    expect((ws['!cols'] as Array<{ wch: number }>).map((c) => c.wch)).toEqual([12, 14, 16, 22, 14, 10, 10, 8, 2, 2, 24, 2, 10, 38]);
  });
  it('nombres de archivo', () => {
    expect(comprobanteFilename([item(3)])).toBe('COMPROBANTE_3_REMUNERACION_MARZO.xlsx');
    expect(comprobanteFilename([item(1), item(2)], 123)).toBe('REPORTE_MASIVO_ANDES SpA_123.xlsx');
    expect(comprobanteFilename([item(1)], 9, true)).toBe('REPORTE_MASIVO_ANDES SpA_9.xlsx');
  });
});
