/**
 * Lógica pura compartida por los modales "Modificar Solicitud Activa" y "Modificar Registro Recepcionado"
 * (forms.js validateSolicitudSums / validateSums, construcción de payloads y transición de estado).
 */
import { formatInteger } from '@/lib/format';
import type { Recepcionado, Solicitud } from '@/lib/solicitud';
import { FOLIO_SUFFIXES, FORMAS_PAGO, type FolioSuffix, type SolicitudApi } from '@/types/domain';
import { cleanMonto } from '@/features/nueva-solicitud/logic';

export { FOLIO_SUFFIXES };
export type { FolioSuffix };

/** Opciones del select en los modales de edición (F:1012-1018 / F:1663-1669; ojo: "DEPOSITO Y VALE VISTA" sin tilde). */
export const FORMA_PAGO_OPTIONS_EDIT: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'DEPOSITO', label: 'DEPÓSITO' },
  { value: 'VALE VISTA', label: 'VALE VISTA' },
  { value: 'DEPOSITO Y VALE VISTA', label: 'DEPOSITO Y VALE VISTA' },
  { value: 'DEVOLUCION - VALE VISTA', label: 'DEVOLUCION - VALE VISTA' },
  { value: 'DEVOLUCION - DEPOSITO', label: 'DEVOLUCION - DEPOSITO' },
];

export interface FolioSlot {
  folio: string;
  /** Monto formateado es-CL (como el input enmascarado). */
  monto: string;
  formaPago: string;
  /** Ruta del PDF en el servidor ('' = sin PDF) — equivale al hidden `pdf_folio_${n}`. */
  pdf: string;
}

export const EMPTY_SLOT: FolioSlot = { folio: '', monto: '', formaPago: '', pdf: '' };

/**
 * Valor inicial de un input de monto enmascarado.
 * Cambio vs legacy: un monto con decimales (p. ej. 1234.5) se redondea en vez de concatenar dígitos (B-21: 12345).
 */
export function montoToInput(v: number | string | null | undefined): string {
  if (v === null || v === undefined || String(v).trim() === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isFinite(n)) return formatInteger(Math.round(n));
  const digits = String(v).replace(/\D/g, '');
  return digits ? formatInteger(parseInt(digits, 10)) : '';
}

/** Los 5 slots fijos a partir del registro (valores `|| ''` como el original). */
export function slotsFromRecord(r: SolicitudApi): FolioSlot[] {
  return FOLIO_SUFFIXES.map((k) => {
    const forma = r[`forma_pago_folio_${k}`] || '';
    return {
      folio: r[`folio_${k}`] || '',
      // `monto || ''` en el original: 0/null → vacío.
      // Cambio vs legacy: en "Modificar Solicitud Activa" el monto inicial ya se muestra con miles (antes sin formato hasta editar).
      monto: r[`monto_por_folio_${k}`] ? montoToInput(r[`monto_por_folio_${k}`]) : '',
      // Un <select> sin opción coincidente queda en "Seleccione..." (valor '').
      formaPago: (FORMAS_PAGO as readonly string[]).includes(forma) ? forma : '',
      pdf: r[`pdf_folio_${k}`] || '',
    };
  });
}

export type CuadraturaStatus = 'cuadrado' | 'excedido' | 'pendiente';
export interface Cuadratura {
  incomplete: boolean[];
  hasIncomplete: boolean;
  sum: number;
  diff: number;
  status: CuadraturaStatus;
  /** Texto del importe en la tarjeta ("$ 0", "$ 1.000"). */
  amountText: string;
  canSubmit: boolean;
}

/** validateSums / validateSolicitudSums (F:1144-1258, F:1747-1861). */
export function computeCuadratura(totalMonto: string, slots: ReadonlyArray<FolioSlot>): Cuadratura {
  const total = cleanMonto(totalMonto) ?? 0;
  let sum = 0;
  const incomplete = slots.map((s) => {
    const folio = s.folio.trim();
    const monto = cleanMonto(s.monto);
    const hasMonto = monto !== null && monto > 0;
    const hasAny = !!folio || hasMonto || !!s.formaPago;
    const complete = !!folio && hasMonto && !!s.formaPago;
    if (monto) sum += monto;
    return hasAny && !complete;
  });
  const hasIncomplete = incomplete.some(Boolean);
  const diff = total - sum;
  const isMatch = Math.abs(diff) < 1;
  const status: CuadraturaStatus = isMatch ? 'cuadrado' : sum > total ? 'excedido' : 'pendiente';
  const amountText = status === 'cuadrado'
    ? '$ 0'
    : `$ ${(status === 'excedido' ? Math.abs(diff) : diff).toLocaleString('es-CL')}`;
  return { incomplete, hasIncomplete, sum, diff, status, amountText, canSubmit: isMatch && !hasIncomplete };
}

/** PATCH del botón "Limpiar" de un folio (C-3 / C-8). */
export function clearSlotPatch(k: FolioSuffix): Record<string, null | number> {
  return { [`folio_${k}`]: null, [`monto_por_folio_${k}`]: 0, [`forma_pago_folio_${k}`]: null };
}

/** Campos folio_* / monto_por_folio_* / pdf_folio_* / forma_pago_folio_* en el orden del original. */
export function folioPayload(slots: ReadonlyArray<FolioSlot>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  FOLIO_SUFFIXES.forEach((k, i) => {
    const s = slots[i] ?? EMPTY_SLOT;
    out[`folio_${k}`] = s.folio || null;
    out[`monto_por_folio_${k}`] = cleanMonto(s.monto);
    out[`pdf_folio_${k}`] = s.pdf || null;
    out[`forma_pago_folio_${k}`] = s.formaPago || null;
  });
  return out;
}

/**
 * Transición al guardar "Modificar Solicitud Activa" (F:1976-1987), sobre el estado NORMALIZADO del front.
 * Se conserva tal cual (regla de negocio existente, ver informe B-4): PENDIENTE→APROBADO NIVEL 1,
 * APROBADO NIVEL 1→APROBADO NIVEL 2, cualquier otro→PENDIENTE. La rama `=== "RECHAZADO"` nunca coincide
 * en el original (el front usa "Rechazado"), pero cae en el mismo resultado.
 */
export function editTransition(estado: string | null | undefined): { estado: string; reviso: string } {
  const e = estado ?? '';
  if (e === 'RECHAZADO') return { estado: 'PENDIENTE', reviso: 'Jefe de Recursos Humanos' };
  if (e.toUpperCase() === 'PENDIENTE') return { estado: 'APROBADO NIVEL 1', reviso: 'Subgerente de Capital Humano' };
  if (e.toUpperCase() === 'APROBADO NIVEL 1') return { estado: 'APROBADO NIVEL 2', reviso: 'Jefe de Finanzas' };
  return { estado: 'PENDIENTE', reviso: 'Jefe de Recursos Humanos' };
}

/** Valor de un <input type="date"> (solo YYYY-MM-DD válido; otro valor queda vacío como en el navegador). */
export function dateInputValue(v: string | null | undefined): string {
  const d = (v ?? '').split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

/** Valores de solo lectura mostrados en el modal de solicitud (F:1511-1605). */
export function solicitudReadonly(s: Solicitud) {
  const x = s as Solicitud & { obraNombre?: string | null };
  return {
    solicitante: s.solicitanteNombre || s.solicitante || '',
    une: s.unidadDeNegocio || s.unidad_de_negocio || '',
    cuentaContable: s.cuentaContable || s.cuenta_contable || '',
    // Cambio vs legacy: un auxiliar nulo se muestra vacío (antes el texto "null"/"undefined").
    auxiliar: s.auxiliar ?? '',
    glosa: s.glosa || '',
    empresa: s.empresaNombre || s.empresa || '',
    obra: x.obraNombre || s.obra || '-',
    proceso: s.procesoNombre || s.proceso || '',
    mes: s.mesProceso || s.mes_de_proceso || '',
    fechaSolicitud: s.fechaProceso ? dateInputValue(s.fechaProceso) : dateInputValue(s.fecha_solicitud),
    fechaPago: s.fechaPago ? dateInputValue(s.fechaPago) : dateInputValue(s.fecha_de_pago),
    monto: montoToInput(s.monto),
  };
}

/** Payload PATCH /todas_solicitudes/{id} de "Guardar y Reenviar" (F:1962-2026). */
export function buildSolicitudEditPayload(
  s: Solicitud, slots: ReadonlyArray<FolioSlot>, observaciones: string, currentUserNombre: string | null | undefined,
) {
  const ro = solicitudReadonly(s);
  const t = editTransition(s.estado);
  return {
    // Se conserva: el solicitante pasa a ser el usuario que edita (comportamiento original).
    solicitante: currentUserNombre ? currentUserNombre : s.solicitante,
    fecha_solicitud: ro.fechaSolicitud,
    folio: s.folio,
    empresa: ro.empresa,
    obra: ro.obra,
    proceso: ro.proceso,
    monto: cleanMonto(ro.monto),
    estado: t.estado,
    reviso: t.reviso,
    modificacion_solicitud: false,
    mes_de_proceso: ro.mes ? ro.mes.toUpperCase() : null,
    anio: ro.fechaSolicitud ? parseInt(ro.fechaSolicitud.split('-')[0], 10) : new Date().getFullYear(),
    cuenta_contable: ro.cuentaContable,
    // Cambio vs legacy: auxiliar nulo se reenvía nulo (antes el texto "null"/"undefined" del input).
    auxiliar: s.auxiliar ?? null,
    fecha_de_pago: ro.fechaPago,
    unidad_de_negocio: ro.une,
    glosa: ro.glosa,
    observaciones,
    ...folioPayload(slots),
  };
}

/** Valores de solo lectura del modal de recepcionado (F:855-955). */
export function recepcionadoReadonly(h: Recepcionado) {
  return {
    solicitante: h.solicitante ?? '',
    une: h.unidad_de_negocio || h.unidadDeNegocio || '',
    cuentaContable: h.cuenta_contable || h.cuentaContable || '',
    auxiliar: h.auxiliar ?? '',
    glosa: h.glosa || '',
    empresa: h.empresa ?? '',
    obra: h.obra || '-',
    proceso: h.proceso ?? '',
    mes: h.mes_de_proceso || h.mesProceso || '',
    anio: h.anio === null || h.anio === undefined ? '' : String(h.anio),
    fechaEmision: dateInputValue(h.fecha_emision || h.fechaEmision),
    fechaSolicitud: dateInputValue(h.fecha_solicitud || h.fechaSolicitud),
    fechaPago: dateInputValue(h.fecha_de_pago || h.fechaPago),
    monto: montoToInput(h.monto),
  };
}

/** validateGenericForm('formEditRecepcionado'): campos `required` vacíos → etiquetas. */
export function recepcionadoMissing(ro: ReturnType<typeof recepcionadoReadonly>): string[] {
  const req: Array<[string, string]> = [
    ['Año', ro.anio], ['Fecha Emisión', ro.fechaEmision], ['Fecha Solicitud', ro.fechaSolicitud], ['Fecha Pago', ro.fechaPago],
  ];
  return req.filter(([, v]) => v.trim() === '').map(([l]) => l);
}

/** Payload POST /recepcionado/{id}/guardar-como-solicitud (F:1366-1411). */
export function buildRecepcionadoPayload(h: Recepcionado, slots: ReadonlyArray<FolioSlot>) {
  const ro = recepcionadoReadonly(h);
  return {
    solicitante: h.solicitante,
    fecha_solicitud: ro.fechaSolicitud,
    folio: h.folio,
    empresa: ro.empresa,
    obra: ro.obra,
    proceso: ro.proceso,
    monto: cleanMonto(ro.monto),
    reviso: h.reviso || 'RECEPCIONADO',
    mes_de_proceso: ro.mes ? ro.mes.toUpperCase() : null,
    anio: parseInt(ro.anio, 10),
    cuenta_contable: ro.cuentaContable,
    // Cambio vs legacy: auxiliar nulo se reenvía nulo (antes el texto "null").
    auxiliar: h.auxiliar ?? null,
    fecha_de_pago: ro.fechaPago,
    unidad_de_negocio: ro.une,
    glosa: ro.glosa,
    observaciones: h.observaciones || '',
    estado: 'PENDIENTE',
    ...folioPayload(slots),
  };
}
