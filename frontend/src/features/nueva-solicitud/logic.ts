/**
 * Lógica pura del formulario "Nueva Solicitud" (forms.js getFormData, calcularUNE/Cuentas/Glosa, executeSubmission,
 * validation.js validateForm, folio.js updateTotalMonto). Sin dependencias de React.
 */
import { formatInteger } from '@/lib/format';
import type { EmpresaApi, ProcesoApi, ProcesoAuxiliarApi } from '@/types/domain';

export const MAX_FOLIOS = 5;

/** Opciones de forma de pago del formulario de creación (dashboard.html:483-500). */
export const FORMA_PAGO_OPTIONS_CREATE: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'DEPOSITO', label: 'DEPÓSITO' },
  { value: 'VALE VISTA', label: 'VALE VISTA' },
  { value: 'DEPOSITO Y VALE VISTA', label: 'DEPÓSITO Y VALE VISTA' },
  { value: 'DEVOLUCION - VALE VISTA', label: 'DEVOLUCION - VALE VISTA' },
  { value: 'DEVOLUCION - DEPOSITO', label: 'DEVOLUCION - DEPOSITO' },
];

export interface FolioRow {
  key: number;
  folio: string;
  monto: string;
  formaPago: string;
  files: File[];
}

export interface NuevaSolicitudValues {
  mesProceso: string;
  fechaProceso: string;
  fechaPago: string;
  empresaId: string;
  obraId: string;
  procesoId: string;
  observaciones: string;
  folios: FolioRow[];
}

/** Forms.formatMontoInput (F:51-63): solo dígitos → separador de miles es-CL; vacío queda vacío. */
export function formatMontoInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits === '') return '';
  return formatInteger(parseInt(digits, 10));
}

/** Forms.cleanMonto (F:756-759). */
export function cleanMonto(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v.toString().trim() === '') return null;
  return parseInt(v.toString().replace(/\D/g, ''), 10) || 0;
}

/** Validation.validateMonto (V:53-64). */
export function validateMonto(monto: string | number | null | undefined): boolean {
  if (!monto || monto === '') return false;
  const clean = typeof monto === 'string' ? monto.replace(/[^\d]/g, '') : monto.toString();
  const amount = parseInt(clean, 10);
  return !Number.isNaN(amount) && amount > 0;
}

const isFilled = (v: string | null | undefined) => v !== null && v !== undefined && v.toString().trim() !== '';

/** folio.js updateTotalMonto: Σ dígitos de cada monto de folio. */
export function sumFolioMontos(rows: ReadonlyArray<{ monto: string }>): number {
  return rows.reduce((acc, r) => {
    const d = r.monto.replace(/\D/g, '');
    return d ? acc + parseInt(d, 10) : acc;
  }, 0);
}

/** Valor mostrado en #monto (siempre formateado, también "0"). */
export const formatTotal = (rows: ReadonlyArray<{ monto: string }>) => formatInteger(sumFolioMontos(rows));

export interface Selected {
  empresa?: EmpresaApi;
  obra?: ProcesoAuxiliarApi;
  proceso?: ProcesoApi;
}

/**
 * Derivados de solo lectura (F:134-171). Se conserva la concatenación de strings del original:
 * un `auxiliar` nulo se convierte en el texto "null" (bug B-2, preexistente; ver informe).
 */
export function deriveFields(sel: Selected, mesProceso: string) {
  const une = sel.empresa && sel.obra ? `${sel.empresa.codigo}${sel.obra.auxiliar}` : '';
  const cuentaObjeto = sel.proceso ? `${sel.proceso.cuenta_objeto}` : '';
  const cuentaAuxiliar = sel.proceso ? `${sel.proceso.auxiliar}` : '';
  const glosa = sel.empresa && sel.obra && sel.proceso && mesProceso
    ? `${sel.proceso.nombre} ${sel.obra.detalle} ${mesProceso.substring(0, 3).toUpperCase()}`
    : '';
  return { une, cuentaObjeto, cuentaAuxiliar, glosa };
}

export type FieldId = 'mesProceso' | 'fechaProceso' | 'fechaPago' | 'empresa' | 'obra' | 'proceso' | 'monto';
export interface FolioRowErrors { folio?: string; monto?: string; formaPago?: string }
export interface ValidationResult {
  valid: boolean;
  fieldErrors: Partial<Record<FieldId, string>>;
  folioErrors: FolioRowErrors[];
  /** Notificaciones (error) en el orden en que el original las muestra. */
  notifications: string[];
}

/** Validation.validateForm (V:170-313) — mensajes literales. `montoTotal` = valor de #monto. */
export function validateNuevaSolicitud(v: NuevaSolicitudValues, montoTotal: string): ValidationResult {
  const fieldErrors: ValidationResult['fieldErrors'] = {};
  const missing: string[] = [];
  let valid = true;

  if (!isFilled(v.mesProceso)) { fieldErrors.mesProceso = 'Debe seleccionar un mes de proceso'; missing.push('Mes de Proceso'); valid = false; }
  if (!isFilled(v.fechaProceso)) { fieldErrors.fechaProceso = 'Debe ingresar la fecha de proceso'; missing.push('Fecha de Proceso'); valid = false; }
  if (!isFilled(v.fechaPago)) {
    fieldErrors.fechaPago = 'Debe ingresar la fecha de pago'; missing.push('Fecha de Pago'); valid = false;
  } else if (!v.fechaProceso || !(new Date(v.fechaPago) >= new Date(v.fechaProceso))) {
    // Sin entrada en "faltan campos" (igual que el original).
    fieldErrors.fechaPago = 'La fecha de pago no puede ser anterior a la fecha de proceso'; valid = false;
  }
  if (!isFilled(v.empresaId)) { fieldErrors.empresa = 'Debe seleccionar una empresa'; missing.push('Empresa'); valid = false; }
  if (!isFilled(v.obraId)) { fieldErrors.obra = 'Debe seleccionar una obra'; missing.push('Unidad / Obra'); valid = false; }
  if (!isFilled(v.procesoId)) { fieldErrors.proceso = 'Debe seleccionar un proceso'; missing.push('Proceso'); valid = false; }
  if (!validateMonto(montoTotal)) { fieldErrors.monto = 'Debe ingresar un monto válido mayor a cero'; missing.push('Monto'); valid = false; }

  let foliosValid = true;
  const folioErrors = v.folios.map((r) => {
    const hasFolio = isFilled(r.folio);
    const hasMonto = validateMonto(r.monto);
    const hasForma = isFilled(r.formaPago);
    const e: FolioRowErrors = {};
    if (hasFolio || hasMonto || hasForma) {
      if (!hasFolio) e.folio = 'Folio requerido';
      if (!hasMonto) e.monto = 'Monto requerido';
      if (!hasForma) e.formaPago = 'Forma de pago requerida';
      if (Object.keys(e).length) foliosValid = false;
    }
    return e;
  });
  if (!foliosValid) { missing.push('Folios/Montos incompletos'); valid = false; }

  const notifications: string[] = [];
  const totalVal = parseInt(montoTotal.replace(/\D/g, ''), 10) || 0;
  const sum = v.folios.reduce((acc, r) => acc + (parseInt(r.monto.replace(/\D/g, ''), 10) || 0), 0);
  if (totalVal !== sum && totalVal > 0) {
    notifications.push('El monto total no coincide con la suma de los montos por folio.');
    valid = false;
  }
  if (!valid && missing.length > 0) notifications.push(`Faltan campos obligatorios: ${missing.join(', ')}`);

  return { valid, fieldErrors, folioErrors, notifications };
}

/** Folios incluidos en el envío/preview: solo filas con número de folio (getFormData F:194-208). */
export function foliosParaEnvio(rows: ReadonlyArray<FolioRow>) {
  return rows
    .filter((r) => r.folio)
    .map((r) => ({ folio: r.folio, monto: cleanMonto(r.monto || '0') ?? 0, forma_pago: r.formaPago, files: r.files }));
}

export interface BuildContext {
  solicitanteNombre: string;
  empresaNombre: string;
  obraNombre: string;
  procesoNombre: string;
  une: string;
  cuentaObjeto: string;
  cuentaAuxiliar: string;
  glosa: string;
  montoTotal: string;
}

/**
 * FormData multipart de POST /todas_solicitudes — mismos nombres y orden que executeSubmission (F:606-707).
 * Solo se envía el PRIMER PDF de cada folio, renombrado `${folio}_${nombreOriginal}` (el backend asocia por prefijo).
 */
export function buildSolicitudFormData(v: NuevaSolicitudValues, ctx: BuildContext, estado = 'ESPERANDO'): FormData {
  const form = new FormData();
  form.append('solicitante', ctx.solicitanteNombre);
  form.append('fecha_solicitud', v.fechaProceso);
  form.append('empresa', ctx.empresaNombre);
  form.append('obra', ctx.obraNombre);
  form.append('proceso', ctx.procesoNombre);
  form.append('monto', String(cleanMonto(ctx.montoTotal)));
  form.append('estado', estado);
  form.append('reviso', 'Jefe de Recursos Humanos');
  form.append('mes_de_proceso', v.mesProceso);
  form.append('anio', String(parseInt(v.fechaProceso.split('-')[0], 10)));
  form.append('cuenta_contable', ctx.cuentaObjeto);
  form.append('auxiliar', ctx.cuentaAuxiliar);
  form.append('fecha_de_pago', v.fechaPago);
  form.append('unidad_de_negocio', ctx.une);
  for (const f of foliosParaEnvio(v.folios)) {
    form.append('folio', f.folio);
    form.append('montos_por_folio', String(f.monto));
    form.append('forma_pago', f.forma_pago);
    if (f.files.length > 0) form.append('pdfs', f.files[0], `${f.folio}_${f.files[0].name}`);
  }
  if (ctx.glosa) form.append('glosa', ctx.glosa);
  if (v.observaciones) form.append('observaciones', v.observaciones);
  return form;
}

/** Archivos aceptados en el arrastre (solo PDF). */
export function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

/** Mapeo backend→campo del formulario para marcar errores 422 (subconjunto existente del mapping F:715-736). */
export const ERROR_FIELD_MAP: Record<string, FieldId | 'glosa'> = {
  monto: 'monto', empresa: 'empresa', proceso: 'proceso', obra: 'obra', glosa: 'glosa', mes_de_proceso: 'mesProceso',
};
