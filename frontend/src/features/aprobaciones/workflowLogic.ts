/**
 * Lógica pura del flujo de aprobación (workflow.js). Sin React: probada con vitest.
 * Las solicitudes llegan normalizadas por mapSolicitud (estado en "Mixed case", etapa = reviso || "Sin Asignar").
 */
import { formatDate } from '@/lib/format';
import type { Solicitud } from '@/lib/solicitud';
import { MESES } from '@/types/domain';

export type Level = 1 | 2;
export type TipoSolicitud = 'Mis Solicitudes' | 'Recepcionado';
export const TIPOS: TipoSolicitud[] = ['Mis Solicitudes', 'Recepcionado'];

export const ETAPA_RRHH = 'Jefe de Recursos Humanos';
export const ETAPA_SUBGERENTE = 'Subgerente de Capital Humano';
export const ETAPA_FINANZAS = 'Jefe de Finanzas';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

type Row = Pick<Solicitud, 'estado' | 'etapa'>;
const lower = (s: string | null | undefined) => (s || '').toLowerCase();
const upper = (s: string | null | undefined) => (s || '').toUpperCase();
const trimmed = (s: string | null | undefined) => (s || '').trim();

export const estadoUpper = (s: Pick<Solicitud, 'estado'>) => upper(s.estado);
export const tipoDe = (s: Pick<Solicitud, 'tipo_solicitud'>): TipoSolicitud =>
  (s.tipo_solicitud || 'Mis Solicitudes') === 'Recepcionado' ? 'Recepcionado' : 'Mis Solicitudes';
export const esRecepcionadoTipo = (s: Pick<Solicitud, 'tipo_solicitud'>) => (s.tipo_solicitud || 'Mis Solicitudes') === 'Recepcionado';

/**
 * Workflow.loadAprobaciones (W:7-17): estado "pendiente" y etapa RRHH / Sin Asignar / vacía.
 * Cambio vs legacy: el re-filtro por Año/Mes/F.Pago (W:337-342) aceptaba además "esperando" y "aprobado nivel 1"
 * (B-8: filas que aparecían/desaparecían al tocar un filtro). Se aplica siempre la regla del render inicial.
 */
export function isAprobacionN1Row(s: Row): boolean {
  if (lower(s.estado) !== 'pendiente') return false;
  const etapa = trimmed(s.etapa);
  return etapa === ETAPA_RRHH || etapa === 'Sin Asignar' || etapa === '';
}

/** Workflow.loadAprobaciones2 (W:25-34). */
export function isAprobacionN2Row(s: Row): boolean {
  const estado = lower(s.estado);
  return trimmed(s.etapa) === ETAPA_SUBGERENTE && (estado === 'aprobado nivel 1' || estado === 'pendiente');
}

export const isAprobacionRow = (level: Level) => (level === 1 ? isAprobacionN1Row : isAprobacionN2Row);

/** Workflow.loadFinanzas (W:1048-1058). */
export function isFinanzasRow(s: Row): boolean {
  const etapa = trimmed(s.etapa);
  const estado = lower(s.estado);
  return (
    (etapa === ETAPA_FINANZAS || etapa === 'Recepcionado') &&
    (estado === 'aprobado nivel 1' || estado === 'aprobado nivel 2' || estado === 'aprobado finanzas' || estado === 'recepcionado')
  );
}

export interface WorkflowGroup<T> { empresa: string; tipo: TipoSolicitud; rows: T[] }

/** Agrupa por empresa (localeCompare 'es', base) y luego tipo (Mis Solicitudes primero). Filas en orden inverso (W:86). */
export function groupByEmpresaTipo<T extends Pick<Solicitud, 'empresaNombre' | 'tipo_solicitud'>>(rows: T[]): WorkflowGroup<T>[] {
  const map = new Map<string, Record<TipoSolicitud, T[]>>();
  for (const s of rows) {
    const empresa = s.empresaNombre;
    if (!map.has(empresa)) map.set(empresa, { 'Mis Solicitudes': [], Recepcionado: [] });
    map.get(empresa)![tipoDe(s)].push(s);
  }
  const out: WorkflowGroup<T>[] = [];
  [...map.keys()]
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' }))
    .forEach((empresa) => {
      for (const tipo of TIPOS) {
        const list = map.get(empresa)![tipo];
        if (list.length) out.push({ empresa, tipo, rows: list.slice().reverse() });
      }
    });
  return out;
}

export interface GroupFilters { anio: string; mes: string; pago: string }
export const EMPTY_FILTERS: GroupFilters = { anio: 'todos', mes: 'todos', pago: 'todos' };

type FilterRow = Pick<Solicitud, 'anio' | 'mesProceso' | 'fechaPago'>;

/** Opciones de los selects Año / Mes / F. Pago a partir de las filas del grupo (W:89-108, 228-235). */
export function filterOptions(rows: FilterRow[]) {
  const anios = [...new Set(rows.map((s) => s.anio))].sort((a, b) => Number(b) - Number(a)).map((a) => String(a));
  const meses = MESES.filter((m) => rows.some((s) => s.mesProceso === m));
  const pagos = [...new Set(rows.map((s) => formatDate(s.fechaPago)))].sort();
  return { anios, meses: [...meses] as string[], pagos };
}

/** filtrarAprobacionesEmpresa / filtrarFinanzasEmpresa: coincidencia exacta con los selects. */
export function applyFilters<T extends FilterRow>(rows: T[], f: GroupFilters): T[] {
  return rows.filter(
    (s) =>
      (f.anio === 'todos' || String(s.anio) === f.anio) &&
      (f.mes === 'todos' || s.mesProceso === f.mes) &&
      (f.pago === 'todos' || formatDate(s.fechaPago) === f.pago),
  );
}

/** Suma de montos seleccionados (parseFloat(data-monto) || 0). */
export function sumMontos(rows: Array<Pick<Solicitud, 'monto'>>): number {
  return rows.reduce((t, s) => t + (parseFloat(String(s.monto)) || 0), 0);
}

/** Nombre de archivo truncado (> 15 → 12 + "..."). */
export function truncateFilename(path: string): { full: string; short: string } {
  const full = path.split('/').pop() || path;
  return { full, short: full.length > 15 ? `${full.substring(0, 12)}...` : full };
}

/** Botón Eliminar en filas de aprobación (W:440-443): solo "Pendiente" / "Aprobado Nivel 1" coinciden tras la normalización. */
export function canDeleteAprobacion(s: Pick<Solicitud, 'estado'>): boolean {
  return s.estado === 'Pendiente' || s.estado === 'Aprobado Nivel 1' || s.estado === 'RECHAZADO' || s.estado === 'PENDIENTE';
}

// ---------------- Payloads de transición (PATCH /todas_solicitudes/{id}) ----------------
export interface TransitionPayload {
  estado: string;
  reviso: string;
  observaciones_devolucion: string;
  modificacion_solicitud: boolean;
}

export type Accion = 'aprobar' | 'aprobar_n2' | 'aprobar_finanzas' | 'devolver';

/** Workflow.procesarAccion (W:1457-1510). */
export function buildTransition(s: Pick<Solicitud, 'etapa'>, accion: Accion, comentarios: string): TransitionPayload {
  const etapa = s.etapa || ETAPA_RRHH;
  switch (accion) {
    case 'aprobar':
      return etapa === ETAPA_SUBGERENTE
        ? { observaciones_devolucion: comentarios, modificacion_solicitud: false, estado: 'APROBADO NIVEL 2', reviso: ETAPA_FINANZAS }
        : { observaciones_devolucion: comentarios, modificacion_solicitud: false, estado: 'APROBADO NIVEL 1', reviso: ETAPA_SUBGERENTE };
    case 'aprobar_n2':
      return { observaciones_devolucion: comentarios, modificacion_solicitud: false, estado: 'APROBADO NIVEL 2', reviso: ETAPA_FINANZAS };
    case 'aprobar_finanzas':
      return { observaciones_devolucion: comentarios, modificacion_solicitud: false, estado: 'APROBADO FINANZAS', reviso: ETAPA_FINANZAS };
    case 'devolver':
      if (etapa === ETAPA_FINANZAS)
        return { observaciones_devolucion: comentarios, modificacion_solicitud: true, estado: 'APROBADO NIVEL 1', reviso: ETAPA_SUBGERENTE };
      if (etapa === ETAPA_SUBGERENTE)
        return { observaciones_devolucion: comentarios, modificacion_solicitud: true, estado: 'PENDIENTE', reviso: ETAPA_RRHH };
      return { observaciones_devolucion: comentarios, modificacion_solicitud: true, estado: 'RECHAZADO', reviso: 'Sin Asignar' };
  }
}

/** Mensaje de éxito de procesarAccion (W:1469-1509). */
export function transitionMessage(s: Pick<Solicitud, 'etapa'>, accion: Accion): { msg: string; type: 'success' | 'info' } {
  switch (accion) {
    case 'aprobar':
      return (s.etapa || ETAPA_RRHH) === ETAPA_SUBGERENTE
        ? { msg: 'Solicitud aprobada Nivel 2 y enviada a Jefe de Finanzas', type: 'success' }
        : { msg: 'Solicitud aprobada Nivel 1 y enviada a Gerencia', type: 'success' };
    case 'aprobar_n2':
      return { msg: 'Solicitud aprobada Nivel 2', type: 'success' };
    case 'aprobar_finanzas':
      return { msg: 'Solicitud aprobada por Finanzas', type: 'success' };
    case 'devolver':
      return { msg: 'Solicitud devuelta al estado anterior', type: 'info' };
  }
}

/** Aprobación masiva (W:739-755). */
export function buildMassApprove(s: Pick<Solicitud, 'etapa'>, level: Level): TransitionPayload {
  const etapa = trimmed(s.etapa);
  return etapa === ETAPA_SUBGERENTE || level === 2
    ? { observaciones_devolucion: 'Aprobación masiva', modificacion_solicitud: false, estado: 'APROBADO NIVEL 2', reviso: ETAPA_FINANZAS }
    : { observaciones_devolucion: 'Aprobación masiva', modificacion_solicitud: false, estado: 'APROBADO NIVEL 1', reviso: ETAPA_SUBGERENTE };
}

// ---------------- Prerrequisitos ----------------
type PdfRow = Pick<Solicitud, 'id' | 'tipo_solicitud' | 'estado' | 'pdf_registro_autorizacion'>;

/** Aprobación individual (W:1443-1455): Recepcionado en APROBADO NIVEL 1 necesita pdf_registro_autorizacion. */
export function needsRegistroAutorizacion(s: PdfRow): boolean {
  return esRecepcionadoTipo(s) && estadoUpper(s) === 'APROBADO NIVEL 1' && !s.pdf_registro_autorizacion;
}

/** Aprobación masiva Nivel 2 (W:704-724): IDs de tipo Recepcionado sin PDF (cualquier estado). */
export function missingRegistroAutorizacionIds(rows: PdfRow[], level: Level): number[] {
  if (level !== 2) return [];
  return rows.filter((s) => esRecepcionadoTipo(s) && !s.pdf_registro_autorizacion).map((s) => s.id);
}

export function missingRegistroAutorizacionText(ids: number[]): string {
  return `Hay (${ids.length}) solicitude(s) que no tienen el "PDF Registro Autorización".El ID(s) son: #${ids.join(', #')}.\n\nDebe cargar el documento para cada una antes de aprobar de forma masiva o aprobar individualmente.`;
}

export const REGISTRO_REQUERIDO_TITLE = 'PDF de Registro de Autorización Requerido';
export const REGISTRO_REQUERIDO_TEXT =
  'Para las solicitudes en estado "Aprobado Nivel 1", debe cargar el PDF de Registro de Autorización antes de poder continuar.\n\nPor favor, cargue el archivo en la columna "PDF Registro Autorización" y intente nuevamente.';

/** Validación de archivo PDF (tipo + tamaño opcional). */
export function pdfFileError(file: Pick<File, 'type' | 'size'>, checkSize: boolean): 'type' | 'size' | null {
  if (file.type !== 'application/pdf') return 'type';
  if (checkSize && file.size > MAX_PDF_BYTES) return 'size';
  return null;
}
