/** Lógica pura de Reportes (reports.js): opciones de filtros, filtrado y filas Excel. */
import { formatDate } from '@/lib/format';
import { FOLIO_SUFFIXES } from '@/types/domain';

/** Registro de reporte: solicitud / recepcionado / histórico ya normalizados (campos crudos + alias camelCase). */
export type ReportRow = { id: number } & Record<string, unknown>;

export interface ReportFilters { year: string; month: string; status: string; company: string }
export const EMPTY_FILTERS: ReportFilters = { year: '', month: '', status: '', company: '' };

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** getMonthName: "1".."12" → nombre; cualquier otro valor (p. ej. "ENERO") pasa sin cambios. */
export function getMonthName(v: string): string {
  return MONTH_NAMES[parseInt(v, 10) - 1] ?? v;
}

/**
 * Año/mes de una fecha en hora LOCAL.
 * Cambio vs legacy: `new Date('YYYY-MM-DD')` se interpreta en UTC y en Chile el día 1 caía en el mes/año anterior;
 * ahora las fechas YYYY-MM-DD (con o sin hora sin zona) se leen literalmente.
 */
export function dateParts(value: unknown): { year: number; month: number } | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/.exec(s);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const str = (v: unknown) => (v == null ? '' : String(v));
const first = (...vals: unknown[]) => vals.find((v) => v != null && v !== '');

/** getUniqueNormalized: sin vacíos, trim, deduplicado sin distinguir mayúsculas (se conserva la primera grafía). */
export function uniqueNormalized(values: unknown[]): string[] {
  const out = new Map<string, string>();
  for (const v of values) {
    if (v == null || v === '') continue;
    const t = String(v).trim();
    if (!t) continue;
    const k = t.toUpperCase();
    if (!out.has(k)) out.set(k, t);
  }
  return [...out.values()];
}

/** Orden de populateSelect: numérico si ambos son números, si no localeCompare. */
export function sortOptions(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

export const ALL_ESTADOS = ['ESPERANDO', 'PENDIENTE', 'RECHAZADO', 'APROBADO NIVEL 1', 'APROBADO NIVEL 2', 'APROBADO FINANZAS', 'RECEPCIONADO', 'PAGADO'];
export const FINANZAS_ESTADOS = ['PAGADO', 'RECEPCIONADO'];

export interface FilterOptions { years: string[]; months: string[]; statuses: string[]; companies: string[] }

/** Opciones del card Histórico (también se usan, filtradas, para Finanzas). */
export function historicoOptions(rows: ReportRow[], statuses = ALL_ESTADOS): FilterOptions {
  return {
    years: sortOptions(uniqueNormalized(rows.map((r) => r.anio))),
    // Cambio vs legacy: String(undefined).toUpperCase() generaba una opción "UNDEFINED"; ahora se omiten vacíos.
    months: sortOptions(uniqueNormalized(rows.map((r) => (r.mesProceso == null || r.mesProceso === '' ? null : str(r.mesProceso).toUpperCase())))),
    statuses: sortOptions(statuses),
    companies: sortOptions(uniqueNormalized(rows.map((r) => first(r.empresa, r.empresaNombre)))),
  };
}

/** Opciones del card Solicitudes (solicitudes + recepcionados), con respaldo por fecha. */
export function todasOptions(rows: ReportRow[]): FilterOptions {
  const date = (r: ReportRow) => dateParts(first(r.fechaProceso, r.fechaSolicitud, r.fechaEmision));
  return {
    years: sortOptions(uniqueNormalized(rows.map((r) => r.anio || date(r)?.year || null))),
    months: sortOptions(uniqueNormalized(rows.map((r) => (r.mesProceso ? str(r.mesProceso).toUpperCase() : date(r)?.month ?? null)))),
    statuses: sortOptions(ALL_ESTADOS),
    companies: sortOptions(uniqueNormalized(rows.map((r) => first(r.empresaNombre, r.empresa)))),
  };
}

/** Base obligatoria del Reporte Finanzas: solo PAGADO y RECEPCIONADO. */
export function finanzasBase(rows: ReportRow[]): ReportRow[] {
  return rows.filter((r) => FINANZAS_ESTADOS.includes(str(r.estado).toUpperCase()));
}

/** getFilteredData: coincidencia exacta sin distinguir mayúsculas; año/mes con respaldo por fecha (hora local). */
export function filterRows(rows: ReportRow[], f: ReportFilters): ReportRow[] {
  const year = f.year.trim().toUpperCase();
  const month = f.month.trim().toUpperCase();
  const status = f.status.trim().toUpperCase();
  const company = f.company.trim().toUpperCase();
  return rows.filter((r) => {
    const dateVal = first(r.fechaProceso, r.fechaSolicitud);
    let itemYear = str(r.anio || '').trim().toUpperCase();
    if (!itemYear && dateVal) itemYear = str(dateParts(dateVal)?.year ?? '');
    let itemMonth = str(r.mesProceso || '').trim().toUpperCase();
    if (!itemMonth && dateVal) itemMonth = str(dateParts(dateVal)?.month ?? '');
    const itemStatus = str(r.estado).trim().toUpperCase();
    const itemCompany = str(first(r.empresa, r.empresaNombre)).trim().toUpperCase();
    if (year && itemYear !== year) return false;
    if (month && itemMonth !== month) return false;
    if (status && itemStatus !== status) return false;
    if (company && itemCompany !== company) return false;
    return true;
  });
}

// ---------------- Excel (getExcelHeaders / getExcelRow) ----------------
const ORDINALS = ['UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO'];
export const EXCEL_HEADERS: string[] = [
  'ID', 'SOLICITANTE', 'FECHA EMISION', 'FECHA SOLICITUD', 'FOLIO', 'EMPRESA', 'OBRA', 'PROCESO', 'MONTO', 'ESTADO', 'REVISO',
  'FECHA APROBACION', 'MES DE PROCESO', 'AÑO', 'CUENTA CONTABLE', 'AUXILIAR', 'FECHA DE PAGO', 'UNIDAD DE NEGOCIO', 'GLOSA',
  'OBSERVACIONES', 'OBSERVACIONES DEVOLUCION',
  ...ORDINALS.flatMap((o) => [`FOLIO ${o}`, `MONTO FOLIO ${o}`, `PDF FOLIO ${o}`, `FORMA DE PAGO FOLIO ${o}`]),
  'TIPO SOLICITUD',
];

export type MoneyCell = { v: number; t: 'n'; z: string };
export function moneyCell(amount: unknown): MoneyCell | '-' {
  if (amount === undefined || amount === null || amount === '') return '-';
  const n = parseFloat(String(amount));
  return Number.isNaN(n) ? '-' : { v: n, t: 'n', z: '$#,##0' };
}
const dateCell = (v: unknown) => (v ? formatDate(String(v)) : '-');
const pdfName = (p: unknown) => (p ? String(p).split(/[/\\]/).pop() || '-' : '-');
const orDash = (v: unknown) => (v == null || v === '' ? '-' : v);

export function buildExcelRow(s: ReportRow): unknown[] {
  const folios = FOLIO_SUFFIXES.flatMap((k) => [
    orDash(s[`folio_${k}`]), moneyCell(s[`monto_por_folio_${k}`]), pdfName(s[`pdf_folio_${k}`]), orDash(s[`forma_pago_folio_${k}`]),
  ]);
  return [
    s.id,
    first(s.solicitanteNombre, s.solicitante),
    dateCell(s.fechaEmision ?? s.fecha_emision),
    dateCell(first(s.fechaProceso, s.fechaSolicitud)),
    s.folio,
    first(s.empresaNombre, s.empresa),
    first(s.obraNombre, s.obra) ?? '-',
    first(s.procesoNombre, s.proceso),
    moneyCell(s.monto),
    s.estado,
    first(s.reviso, s.etapa) ?? '-',
    // Cambio vs legacy: respaldo al campo crudo; antes FECHA APROBACION salía '-' para solicitudes (no se mapeaba).
    dateCell(first(s.fechaAprobacion, s.fecha_aprobacion)),
    orDash(s.mesProceso),
    orDash(s.anio),
    // Cambio vs legacy: CUENTA CONTABLE salía siempre '-' en Histórico (clave snake_case vs camelCase).
    orDash(first(s.cuentaContable, s.cuenta_contable)),
    orDash(s.auxiliar),
    dateCell(first(s.fechaPago, s.fecha_de_pago)),
    orDash(first(s.unidadDeNegocio, s.unidad_de_negocio)),
    orDash(s.glosa),
    orDash(s.observaciones),
    // Cambio vs legacy: OBSERVACIONES DEVOLUCION salía siempre '-' en Histórico (el mapeo no la incluía).
    orDash(first(s.observacionesDevolucion, s.observaciones_devolucion)),
    ...folios,
    s.tipo_solicitud || 'Solicitud',
  ];
}

export function buildExcelAoa(rows: ReportRow[]): unknown[][] {
  return [EXCEL_HEADERS, ...rows.map(buildExcelRow)];
}

/** Cambio vs legacy: fecha local (antes toISOString → UTC, de noche en Chile salía el día siguiente). */
export function reportFilename(kind: 'Historico' | 'General', isoDate: string): string {
  return `Reporte_${kind}_${isoDate}.xlsx`;
}

/**
 * Alias de campos tipo solicitud para el comprobante (que lee empresaNombre/procesoNombre/cuentaContable/fechaProceso).
 * Cambio vs legacy: el original pasaba registros de histórico sin estos alias → PROCESO/CUENTA/FECHA PROCESO vacíos.
 */
export function toComprobanteRows(rows: ReportRow[]): ReportRow[] {
  return rows.map((r) => ({
    ...r,
    empresaNombre: first(r.empresaNombre, r.empresa),
    procesoNombre: first(r.procesoNombre, r.proceso),
    cuentaContable: first(r.cuentaContable, r.cuenta_contable),
    fechaProceso: first(r.fechaProceso, r.fechaSolicitud, r.fecha_solicitud),
  }));
}
