/** Lógica pura de "Gestión Finanzas" (workflow.js loadFinanzas / aprobarMultiplesFinanzas / procesarSoloFinanzas / ejecutarRecepcionCore). */
import type { Solicitud } from '@/lib/solicitud';
import { FOLIO_SUFFIXES } from '@/types/domain';
import { esRecepcionadoTipo, estadoUpper, tipoDe, type Accion, type TipoSolicitud } from '@/features/aprobaciones/workflowLogic';

export type FinanzasRowMode = 'acciones' | 'fase1' | 'fase2' | 'completado';

/** Columna Acciones según estado (W:835-890). */
export function finanzasRowMode(s: Pick<Solicitud, 'estado'>, tipo: TipoSolicitud): FinanzasRowMode {
  const e = estadoUpper(s);
  if (e === 'PENDIENTE' || e === 'APROBADO NIVEL 1' || e === 'APROBADO NIVEL 2') return 'acciones';
  if (e === 'APROBADO FINANZAS') return tipo === 'Mis Solicitudes' ? 'fase1' : 'fase2';
  return 'completado';
}

/** Candado en lugar del checkbox "Seleccionar para aprobar" (W:804-806). */
export const isFinanzasRestricted = (s: Pick<Solicitud, 'estado'>, tipo: TipoSolicitud) =>
  estadoUpper(s) === 'APROBADO FINANZAS' && tipo === 'Mis Solicitudes';

export const isAprobadoFinanzas = (s: Pick<Solicitud, 'estado'>) => estadoUpper(s) === 'APROBADO FINANZAS';

/** Botón "Aprobar" individual de Finanzas (W:1534-1548). null = no hace nada (igual que el original). */
export function finanzasApproveAction(s: Pick<Solicitud, 'estado'>): { accion: Accion; comentario: string } | null {
  const e = estadoUpper(s);
  if (e === 'APROBADO NIVEL 1' || e === 'PENDIENTE') return { accion: 'aprobar_n2', comentario: 'Aprobado automáticamente por Jefe de Finanzas' };
  if (e === 'APROBADO NIVEL 2') return { accion: 'aprobar_finanzas', comentario: 'Aprobado por Finanzas' };
  return null;
}

export type MassFinanzasStep =
  | { kind: 'recepcionar' }
  | { kind: 'patch'; accion: Accion; comentario: string }
  | { kind: 'omitir' };

/** Acción por fila en "Procesar Seleccionadas" (W:2202-2228). */
export function massFinanzasStep(s: Pick<Solicitud, 'estado'>): MassFinanzasStep {
  const e = estadoUpper(s);
  if (e === 'APROBADO FINANZAS') return { kind: 'recepcionar' };
  if (e === 'APROBADO NIVEL 1' || e === 'PENDIENTE') return { kind: 'patch', accion: 'aprobar_n2', comentario: 'Aprobado masivamente por Jefe de Finanzas' };
  if (e === 'APROBADO NIVEL 2') return { kind: 'patch', accion: 'aprobar_finanzas', comentario: 'Aprobado masivamente por Finanzas' };
  return { kind: 'omitir' };
}

type ValRow = Pick<Solicitud, 'id' | 'estado' | 'folio' | 'tipo_solicitud' | 'pdf_firmado' | 'pdf_registro_autorizacion'>;
const sinFolio = (s: ValRow) => !s.folio || s.folio.trim() === '';
const sinPdfsRecepcion = (s: ValRow) => esRecepcionadoTipo(s) && (!s.pdf_firmado || !s.pdf_registro_autorizacion);

/** Validaciones consolidadas de aprobarMultiplesFinanzas (W:2143-2187). Devuelve el texto o null. */
export function validateProcesarSeleccionadas(rows: ValRow[]): string | null {
  const folio: number[] = [];
  const pdf: number[] = [];
  const regAuth: number[] = [];
  for (const s of rows) {
    const e = estadoUpper(s);
    if (e === 'APROBADO FINANZAS') {
      if (sinFolio(s)) folio.push(s.id);
      if (sinPdfsRecepcion(s)) pdf.push(s.id);
    }
    if (e === 'APROBADO NIVEL 1' && esRecepcionadoTipo(s) && !s.pdf_registro_autorizacion) regAuth.push(s.id);
  }
  if (!folio.length && !pdf.length && !regAuth.length) return null;
  let msg = 'No se pueden procesar las solicitudes debido a falta de información:\n\n';
  if (folio.length) msg += `- Falta Folio en IDs: #${folio.join(', #')}\n`;
  if (pdf.length) msg += `- Falta PDF Firmado/Autorización (necesarios para recepción) en IDs: #${pdf.join(', #')}\n`;
  if (regAuth.length) msg += `- Falta PDF de Autorización (necesario para Nivel 2) en IDs: #${regAuth.join(', #')}\n`;
  return msg.trimEnd();
}

/** Validaciones de procesarSoloFinanzas (W:2275-2299). */
export function validateRecepcion(rows: ValRow[]): string | null {
  const folio = rows.filter(sinFolio).map((s) => s.id);
  const pdf = rows.filter(sinPdfsRecepcion).map((s) => s.id);
  if (!folio.length && !pdf.length) return null;
  let msg = 'No se pueden recepcionar las solicitudes debido a falta de información:\n\n';
  if (folio.length) msg += `- Falta Folio en IDs: #${folio.join(', #')}\n`;
  if (pdf.length) msg += `- Falta PDF Firmado/Autorización en IDs: #${pdf.join(', #')}\n`;
  return msg.trimEnd();
}

/**
 * "Aprobación de finanzas" (W:2255-2262): TODAS las solicitudes APROBADO FINANZAS de la empresa y tipo,
 * ignorando selección y filtros (B-15, comportamiento conservado: el diálogo de confirmación indica el total).
 */
export function soloFinanzasRows<T extends Pick<Solicitud, 'empresaNombre' | 'tipo_solicitud' | 'estado'>>(all: T[], empresa: string, tipo: TipoSolicitud): T[] {
  return all.filter((s) => s.empresaNombre === empresa && tipoDe(s) === tipo && isAprobadoFinanzas(s));
}

/**
 * Exportación XLSX (W:1700-1705): TODAS las APROBADO FINANZAS de la empresa (todos los tipos), sin filtros (B-14, conservado).
 * Cambio vs legacy: la empresa se identifica por su nombre exacto, no "des-slugificando" el id de la tarjeta (ambiguo).
 */
export function exportRows<T extends Pick<Solicitud, 'empresaNombre' | 'estado'>>(all: T[], empresa: string): T[] {
  return all.filter((s) => s.empresaNombre === empresa && isAprobadoFinanzas(s));
}

/**
 * Cuerpo de POST /recepcionado (ejecutarRecepcionCore, W:1614-1661).
 * `folio` es el folio normalizado ("MÚLTIPLES FOLIOS" si hay varios — B-5, conservado).
 * Cambio vs legacy: fecha_emision usa la fecha LOCAL (el original usaba toISOString → fecha UTC, día siguiente por la tarde en Chile).
 */
export function buildRecepcionadoPayload(s: Solicitud, today: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    solicitante: s.solicitanteNombre,
    fecha_emision: today,
    fecha_solicitud: s.fechaProceso,
    folio: s.folio,
    empresa: s.empresaNombre,
    obra: s.obra,
    proceso: s.procesoNombre,
    monto: s.monto,
    estado: esRecepcionadoTipo(s) ? 'PAGADO' : 'RECEPCIONADO',
    reviso: 'Recepcionado',
    mes_de_proceso: s.mesProceso,
    anio: s.anio,
    cuenta_contable: s.cuentaContable,
    auxiliar: s.auxiliar,
    fecha_de_pago: s.fechaPago,
    unidad_de_negocio: s.unidadDeNegocio,
    glosa: s.glosa,
    observaciones: s.observaciones,
    observaciones_devolucion: s.observaciones_devolucion,
    // fechaAprobacion nunca se mapea en el original (B-16): siempre la fecha local de hoy.
    fecha_aprobacion: today,
  };
  for (const k of FOLIO_SUFFIXES) {
    body[`folio_${k}`] = s[`folio_${k}`] || null;
    body[`monto_por_folio_${k}`] = s[`monto_por_folio_${k}`] || null;
    body[`pdf_folio_${k}`] = s[`pdf_folio_${k}`] || null;
    body[`forma_pago_folio_${k}`] = s[`forma_pago_folio_${k}`] || null;
  }
  body.pdf_firmado = s.pdf_firmado || null;
  body.pdf_registro_autorizacion = s.pdf_registro_autorizacion || null;
  body.tipo_solicitud = s.tipo_solicitud || 'Mis Solicitudes';
  body.id_solicitud_origen = s.id;
  body.modificacion_solicitud = false;
  return body;
}
