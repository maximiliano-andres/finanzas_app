import { formatCurrency } from './format';
import { FOLIO_SUFFIXES, type SolicitudApi } from '@/types/domain';

/** Normalización del estado (data.js:1114-1122) — se conserva tal cual porque filtros/badges dependen de ella. */
export function normalizeEstado(estado: string | null | undefined): string {
  if (estado === 'APROBADO NIVEL 1') return 'Aprobado Nivel 1';
  if (estado) return estado.charAt(0).toUpperCase() + estado.slice(1).toLowerCase();
  return 'Pendiente';
}

function multiDisplay(s: SolicitudApi) {
  const multiple = !!s.folio_dos;
  return {
    formaDePago: multiple ? 'MÚLTIPLE' : s.forma_pago_folio_uno || '-',
    montoPorFolio: multiple ? 'MÚLTIPLES MONTOS' : formatCurrency(s.monto_por_folio_uno),
  };
}

/** Solicitud normalizada (data.js:1095-1163). Conserva todos los campos crudos de folios. */
export type Solicitud = SolicitudApi & {
  solicitanteId: number | null;
  solicitanteNombre: string;
  fechaProceso?: string | null;
  fechaEmision?: string | null;
  empresaNombre: string;
  procesoNombre: string;
  etapa: string;
  mesProceso?: string | null;
  cuentaContable?: string | null;
  estadoRaw: string | null;
  estado: string;
  fechaPago?: string | null;
  unidadDeNegocio?: string | null;
  formaDePago: string;
  montoPorFolio: string;
  tipo_solicitud: string;
};

export function mapSolicitud(s: SolicitudApi): Solicitud {
  return {
    ...s,
    solicitanteId: s.usuario_id ? parseInt(String(s.usuario_id), 10) : null,
    solicitanteNombre: s.solicitante,
    fechaProceso: s.fecha_solicitud,
    fechaEmision: s.fecha_emision,
    folio: s.folio_dos ? 'MÚLTIPLES FOLIOS' : s.folio,
    empresaNombre: s.empresa,
    procesoNombre: s.proceso,
    etapa: s.reviso || 'Sin Asignar',
    mesProceso: s.mes_de_proceso,
    cuentaContable: s.cuenta_contable,
    estadoRaw: s.estado ?? null,
    estado: normalizeEstado(s.estado),
    fechaPago: s.fecha_de_pago,
    unidadDeNegocio: s.unidad_de_negocio,
    historial: s.historial || [],
    tipo_solicitud: s.tipo_solicitud || 'Mis Solicitudes',
    ...multiDisplay(s),
  };
}

/** Recepcionado normalizado (data.js:189-250). El estado NO se normaliza en el original. */
export type Recepcionado = SolicitudApi & {
  solicitanteId: number | null;
  fechaEmision?: string | null;
  fechaSolicitud?: string | null;
  fechaAprobacion?: string | null;
  mesProceso?: string | null;
  cuentaContable?: string | null;
  fechaPago?: string | null;
  unidadDeNegocio?: string | null;
  observacionesDevolucion?: string | null;
  formaDePago: string;
  montoPorFolio: string;
  obra: string;
  folio: string;
};

export function mapRecepcionado(h: SolicitudApi): Recepcionado {
  return {
    ...h,
    solicitanteId: h.usuario_id ? parseInt(String(h.usuario_id), 10) : null,
    fechaEmision: h.fecha_emision,
    fechaSolicitud: h.fecha_solicitud,
    fechaAprobacion: h.fecha_aprobacion,
    mesProceso: h.mes_de_proceso,
    cuentaContable: h.cuenta_contable,
    fechaPago: h.fecha_de_pago,
    unidadDeNegocio: h.unidad_de_negocio,
    observacionesDevolucion: h.observaciones_devolucion,
    folio: h.folio_dos ? 'MÚLTIPLES FOLIOS' : h.folio || '-',
    obra: h.obra || '-',
    ...multiDisplay(h),
  };
}

/** Histórico normalizado (data.js:309-369). */
export type Historico = Recepcionado & { idSolicitudOrigen?: number | null; fechaRegistroHistorico?: string | null };

export function mapHistorico(h: SolicitudApi): Historico {
  return { ...mapRecepcionado(h), idSolicitudOrigen: h.id_solicitud_origen, fechaRegistroHistorico: h.fecha_registro_historico };
}

export interface FolioSubRow {
  fechaEmision?: string | null;
  obra?: string | null;
  folio?: string | null;
  monto?: number | string | null;
  formaDePago?: string | null;
}

/** Sub-filas por folio (utils.js getFolioSubRows). */
export function getFolioSubRows(s: SolicitudApi & { fechaEmision?: string | null; montoPorFolio?: string; formaDePago?: string }): FolioSubRow[] {
  const rows: FolioSubRow[] = [];
  for (const k of FOLIO_SUFFIXES) {
    const folio = s[`folio_${k}`];
    if (folio) rows.push({ fechaEmision: s.fechaEmision, obra: s.obra, folio, monto: s[`monto_por_folio_${k}`], formaDePago: s[`forma_pago_folio_${k}`] });
  }
  if (!rows.length) rows.push({ fechaEmision: s.fechaEmision, obra: s.obra, folio: s.folio, monto: s.montoPorFolio || s.monto, formaDePago: s.formaDePago });
  return rows;
}

/** Folios presentes 1..5 con sus datos (detalle / edición). */
export function getFolios(s: SolicitudApi) {
  return FOLIO_SUFFIXES.map((k, i) => ({
    index: i + 1,
    suffix: k,
    folio: s[`folio_${k}`] ?? null,
    monto: s[`monto_por_folio_${k}`] ?? null,
    pdf: s[`pdf_folio_${k}`] ?? null,
    formaPago: s[`forma_pago_folio_${k}`] ?? null,
  }));
}
