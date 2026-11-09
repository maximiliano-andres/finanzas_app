/**
 * Construcción PURA del comprobante contable (Workflow.generarComprobanteContable, W:1727-2022):
 * filas, totales y la hoja (celdas + estilos + anchos) como objeto plano. La escritura XLSX vive en comprobante.ts.
 */
import { formatDate } from '@/lib/format';

export type ComprobanteItem = Record<string, unknown> & { id?: number | string; monto?: number | string | null };

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
/** Primer valor "truthy" entre varias claves (forma solicitud normalizada o forma cruda/histórico). */
function pick(o: ComprobanteItem, ...keys: string[]): string {
  for (const k of keys) if (o[k]) return str(o[k]);
  return '';
}

/**
 * Cambio vs legacy: se aceptan también los nombres de campo crudos/histórico (empresa, proceso, cuenta_contable,
 * fecha_solicitud/fechaSolicitud, mes_de_proceso, unidad_de_negocio). El original solo leía los de la solicitud
 * normalizada, por lo que el reporte de Reportes (histórico) salía con PROCESO/CUENTA/NOMBRE/FECHA vacíos.
 */
export function normalizeItem(o: ComprobanteItem) {
  return {
    id: o.id,
    empresa: pick(o, 'empresaNombre', 'empresa'),
    proceso: pick(o, 'procesoNombre', 'proceso'),
    cuenta: pick(o, 'cuentaContable', 'cuentaObjeto', 'cuenta_contable'),
    auxiliar: pick(o, 'auxiliar'),
    obra: pick(o, 'obra', 'obraNombre'),
    mes: pick(o, 'mesProceso', 'mes_de_proceso'),
    anio: str(o.anio),
    une: pick(o, 'unidadDeNegocio', 'unidad_de_negocio', 'une'),
    glosa: pick(o, 'glosa'),
    fechaProceso: pick(o, 'fechaProceso', 'fechaSolicitud', 'fecha_solicitud'),
    monto: o.monto,
  };
}

export interface ComprobanteRow {
  une: string; cuentaObj: string; cuentaAux: string; proceso: string; obra: string; periodo: string; monto: number;
  concatenadoK: string; glosaN: string;
}

/** Una línea por solicitud con monto (desglose por folio comentado en el original, W:1871-1907). */
export function buildComprobanteRows(items: ComprobanteItem[]): { rows: ComprobanteRow[]; total: number } {
  const rows: ComprobanteRow[] = [];
  for (const raw of items) {
    if (!raw.monto) continue;
    const s = normalizeItem(raw);
    let une = s.une;
    if (!une && s.empresa) une = s.empresa.toUpperCase().includes('ANDES') ? '1001000010' : '2001000193';
    const cuentaAux = s.auxiliar || '0010';
    const periodo = `${s.mes.substring(0, 3).toUpperCase()}${s.anio.substring(2)}`;
    const monto = parseFloat(str(s.monto)) || 0;
    rows.push({
      une, cuentaObj: s.cuenta, cuentaAux, proceso: s.proceso, obra: s.obra, periodo, monto,
      concatenadoK: `${une}.${s.cuenta}.${cuentaAux}`,
      glosaN: `${s.proceso} ${s.obra} ${periodo}`.toUpperCase(),
    });
  }
  // Cambio vs legacy: el original descartaba filas a partir de la 50 (máx. 32 ítems) y TOTALES las excluía (B-13).
  return { rows, total: rows.reduce((t, r) => t + r.monto, 0) };
}

export function comprobanteFilename(items: ComprobanteItem[], now = Date.now(), masivo = false): string {
  const s1 = normalizeItem(items[0]);
  return items.length === 1 && !masivo
    ? `COMPROBANTE_${s1.id}_${s1.proceso || 'REMUNERACION'}_${s1.mes}.xlsx`
    : `REPORTE_MASIVO_${s1.empresa || 'ANDES'}_${now}.xlsx`;
}

// ---------------- Estilos (idénticos al original) ----------------
const bThin = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
const sBorder = { border: bThin };
const sYellow = { border: bThin, fill: { fgColor: { rgb: 'FFFF00' } } };
const sYellowNumBold = { border: bThin, fill: { fgColor: { rgb: 'FFFF00' } }, font: { bold: true }, alignment: { horizontal: 'right' } };
const sCenter = { border: bThin, alignment: { horizontal: 'center' } };
const sBold = { border: bThin, font: { bold: true } };
const sHead = { border: bThin, font: { bold: true }, alignment: { horizontal: 'center' } };
const sLightYellow = { border: bThin, fill: { fgColor: { rgb: '1FADFF' } } };
const sLightYellowBold = { border: bThin, fill: { fgColor: { rgb: '1FADFF' } }, font: { bold: true } };
const sLightYellowNumBold = { border: bThin, fill: { fgColor: { rgb: '1FADFF' } }, font: { bold: true }, alignment: { horizontal: 'right' } };

export interface SheetCell { v: string | number; s?: unknown; t?: 'n' | 's'; z?: string }
export type Sheet = Record<string, SheetCell | string | Array<{ wch: number }>>;

export const COLUMN_WIDTHS = [12, 14, 16, 22, 14, 10, 10, 8, 2, 2, 24, 2, 10, 38];

/** Hoja "Comprobante" completa como objeto plano compatible con xlsx-js-style. */
export function buildComprobanteSheet(items: ComprobanteItem[]): { ws: Sheet; total: number; rowCount: number } {
  const s1 = normalizeItem(items[0]);
  const ws: Sheet = {};
  const set = (ref: string, v: string | number, s?: unknown, extra?: Partial<SheetCell>) => { ws[ref] = { v, ...(s ? { s } : {}), ...extra }; };

  set('A1', 'Andes Servicios S.A.', { font: { bold: true, color: { rgb: '000080' }, sz: 14 } });
  set('A2', 'AGUSTINAS Nº 853 OFICINA Nº 841, SANTIAGO', { font: { sz: 9 } });
  set('A3', 'RUT Nº 78.119.320-8', { font: { sz: 9 } });
  set('A4', 'FONO S ( 02 ) 6399100 - ( 72 ) 259363', { font: { sz: 9 } });
  set('D6', 'COMPROBANTE ÚNICO DE CONTABILIDAD', { font: { bold: true, sz: 11 } });

  set('A8', '', sBorder); set('B8', 'INGRESO', sBorder); set('C8', '', sBorder);
  set('A9', 'OPERACIÓN', sBorder); set('B9', 'EGRESO', sBorder); set('C9', 'X', { ...sCenter, font: { bold: true } });
  set('A10', 'REALIZADA', sBorder); set('B10', 'DIARIO', sBorder); set('C10', '', sBorder);
  set('A11', '', sBorder); set('B11', 'TRASPASO', sBorder); set('C11', '', sBorder);
  set('G8', '', sBorder); set('H8', 'N.C', sBorder); set('G9', '', sBorder); set('H9', 'Nº', sBorder);
  set('F11', 'FECHA PROCESO', sBorder);
  set('G11', formatDate(s1.fechaProceso || null), sBold);

  set('A13', 'NOMBRE', sBorder);
  set('B13', s1.empresa ? s1.empresa.toUpperCase() : 'ANDES SERVICIOS S.A.', sBorder);
  for (const c of ['C', 'D', 'E', 'F', 'G']) set(`${c}13`, '', sBorder);
  set('H13', '78119320-8', sBorder);
  set('A14', 'GLOSA', sBorder);
  const glosa = s1.glosa ? s1.glosa.toUpperCase() : `${s1.proceso || 'REMUNERACIONES'} ${s1.obra} ${s1.mes}`.toUpperCase();
  set('B15', glosa, { font: { bold: true } });

  ['UNE', 'CUENTA OBJETO', 'CUENTA AUXILIAR', 'PROCESO', 'CENTRO COSTO', 'PERIODO', 'DEBE', 'HABER'].forEach((h, i) =>
    set(`${'ABCDEFGH'[i]}17`, h, sHead),
  );

  const { rows, total } = buildComprobanteRows(items);
  const start = 18;
  rows.forEach((r, i) => {
    const row = start + i;
    set(`A${row}`, r.une, sYellow); set(`B${row}`, r.cuentaObj, sYellow); set(`C${row}`, r.cuentaAux, sYellow);
    set(`D${row}`, r.proceso, sYellow); set(`E${row}`, r.obra, sYellow); set(`F${row}`, r.periodo, sYellow);
    set(`G${row}`, r.monto, sYellowNumBold, { t: 'n', z: '#,##0' });
    set(`H${row}`, '', sYellow);
    set(`K${row}`, r.concatenadoK, sLightYellow);
    set(`M${row}`, r.monto, sLightYellowNumBold, { t: 'n', z: '#,##0' });
    set(`N${row}`, r.glosaN, sLightYellowBold);
  });

  const pagoRow = start + rows.length - 1 + 2;
  set(`A${pagoRow}`, 'PAGADO', sBorder); set(`B${pagoRow}`, 'SI', sBorder); set(`C${pagoRow}`, '', sBorder);
  set(`D${pagoRow}`, '', sBorder); set(`E${pagoRow}`, 'CHEQUE Nº', sBorder); set(`F${pagoRow}`, '', sBorder);
  const efectivoRow = pagoRow + 1;
  set(`A${efectivoRow}`, 'EFECTIVO', sBorder); set(`B${efectivoRow}`, 'NO', sBorder); set(`C${efectivoRow}`, '', sBorder);
  set(`D${efectivoRow}`, '', sBorder); set(`E${efectivoRow}`, '', sBorder); set(`F${efectivoRow}`, 'TOTALES', sBold);
  set(`G${efectivoRow}`, total, sBold, { t: 'n', z: '"$" #,##0' });
  set(`H${efectivoRow}`, '', sBorder);
  const firmaRow = efectivoRow + 2;
  set(`A${firmaRow}`, 'FINANZAS', sBorder); set(`B${firmaRow}`, '', sBorder); set(`C${firmaRow}`, 'CONTADOR', sBorder);
  set(`D${firmaRow}`, '', sBorder); set(`E${firmaRow}`, 'GERENCIA', sBorder); set(`F${firmaRow}`, 'RECIBI CONFORME', sBorder);
  set(`G${firmaRow}`, '', sBorder);
  set(`F${firmaRow + 1}`, 'RUT Nº', sBorder); set(`G${firmaRow + 1}`, '', sBorder);

  ws['!ref'] = `A1:N${firmaRow + 2}`;
  ws['!cols'] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  return { ws, total, rowCount: rows.length };
}
