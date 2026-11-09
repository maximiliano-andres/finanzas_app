/** Lógica pura del módulo Administración (admin.js + helpers CRUD de data.js). */
import { ApiError } from '@/api/client';
import { parsePydanticErrors } from '@/lib/validation';
import type { UsuarioApi } from '@/types/domain';

// ---------------- Roles / cargos (admin.js:5-22, 274-282, 876-881) ----------------
export const ROLE_CARGO_MAPPING: Record<string, string[]> = {
  Administrador: ['Jefe de Recursos Humanos', 'Subgerente de Capital Humano', 'Administrador'],
  Solicitante: ['Analista de personal', 'Jefe de Recursos Humanos'],
  Aprobador: ['Subgerente de Capital Humano', 'Jefe de Recursos Humanos'],
  'Responsable Finanzas': ['Jefe de Finanzas'],
};
export const ROLES = Object.keys(ROLE_CARGO_MAPPING);

/** IDs fijos del original (dependen del orden del seed: db_seed.py:92-96). */
export const ROLE_IDS: Record<string, number> = { Administrador: 1, Solicitante: 2, Aprobador: 3, 'Responsable Finanzas': 4 };

export function cargosForRol(rol: string): string[] {
  return ROLE_CARGO_MAPPING[rol] ?? [];
}

/** updateCargoOptions: si el cargo no pertenece al rol, el <select> queda en la primera opción. */
export function resolveCargo(rol: string, selected: string | null | undefined): string {
  const cargos = cargosForRol(rol);
  return selected && cargos.includes(selected) ? selected : (cargos[0] ?? '');
}

/** El <select> de rol sin coincidencia queda en la primera opción (Administrador). */
export function resolveRol(rol: string | null | undefined): string {
  return rol && ROLES.includes(rol) ? rol : ROLES[0];
}

export function getRoleBadgeClass(rol: string): string {
  const map: Record<string, string> = {
    Administrador: 'badge-role-admin',
    Solicitante: 'badge-role-solicitante',
    Aprobador: 'badge-role-aprobador',
    'Responsable Finanzas': 'badge-role-finanzas',
  };
  return map[rol] ?? 'badge-approved';
}

export function estadoBadgeClass(estado: string | null | undefined): string {
  return estado && estado.toLowerCase() === 'activo' ? 'badge-approved' : 'badge-pending';
}

/**
 * Valor inicial del select Estado.
 * Cambio vs legacy: el original comparaba con 'Activo'/'Inactivo' pero el backend devuelve 'ACTIVO'/'INACTIVO',
 * por lo que al editar un registro inactivo quedaba "Activo" y al guardar se reactivaba.
 */
export function estadoSelectValue(estado: string | null | undefined): 'Activo' | 'Inactivo' {
  return String(estado ?? '').trim().toUpperCase() === 'INACTIVO' ? 'Inactivo' : 'Activo';
}

// ---------------- Usuarios: mapeo de tabla (data.js:1043-1057) ----------------
export interface UsuarioRow {
  id: number;
  nombre: string;
  username: string;
  email: string;
  cargo: string;
  rol: string;
  raw: UsuarioApi;
}
export function mapUsuarioRow(u: UsuarioApi): UsuarioRow {
  return {
    id: u.id,
    nombre: `${u.nombre_1} ${u.apellido_1}`,
    username: String(u.email ?? '').split('@')[0],
    email: u.email,
    cargo: u.cargo,
    rol: u.rol_nombre || 'Desconocido',
    raw: u,
  };
}

/** Validation.validateRUT (validation.js:10-30): solo formato, sin módulo 11. */
export function validateRUT(rut: string): boolean {
  if (!rut || !rut.includes('-')) return false;
  const clean = rut.replace(/\./g, '').replace(/-/g, '');
  if (clean.length < 8 || clean.length > 9) return false;
  return /^\d+$/.test(clean.slice(0, -1));
}

export const MSG_REQUIRED = 'Por favor complete todos los campos requeridos';

export interface UsuarioForm {
  nombre1: string; nombre2: string; apellido1: string; apellido2: string;
  rut: string; email: string; rol: string; cargo: string; obrasIds: number[];
}

/** saveUsuario (admin.js:835-893): validación en el mismo orden y payload idéntico. */
export function validateUsuario(f: UsuarioForm): string | null {
  const t = (s: string) => s.trim();
  if (!t(f.nombre1) || !t(f.apellido1) || !t(f.email) || !f.rol || !t(f.rut) || !t(f.cargo)) return MSG_REQUIRED;
  if (f.obrasIds.length === 0) return 'Debe seleccionar al menos una Unidad de Negocio / Obra';
  if (!validateRUT(t(f.rut))) return 'El RUT ingresado no es válido. Formato requerido: 12345678-9';
  return null;
}

export function buildUsuarioPayload(f: UsuarioForm) {
  return {
    cargo: f.cargo.trim(),
    nombre_1: f.nombre1.trim(),
    nombres_2: f.nombre2.trim() || null,
    apellido_1: f.apellido1.trim(),
    apellido_2: f.apellido2.trim() || null,
    email: f.email.trim(),
    rol_id: ROLE_IDS[f.rol],
    rut: f.rut.trim(),
    obras_ids: f.obrasIds,
  };
}

// ---------------- Errores de API → mensaje + campos (data.js parseError / markFieldsWithErrors) ----------------
/** Mapeo campo backend → id del input (corrige ids inexistentes del original: C.2.4). */
export const FIELD_MAP = {
  empresa: { empresa: 'adminNombre', codigo: 'adminCodigo' },
  obra: { numero: 'adminObraNombre', detalle: 'adminObraDetalle', auxiliar: 'adminObraAuxiliar', estado: 'adminObraEstado' },
  proceso: {
    nombre: 'adminProcesoNombre', proceso: 'adminProcesoProceso', cuenta_objeto: 'adminProcesoCuentaObjeto',
    auxiliar: 'adminProcesoCuentaAuxiliar', estado: 'adminProcesoEstado',
  },
  usuario: {
    nombre_1: 'adminUsuarioNombre', nombres_2: 'adminUsuarioNombre2', apellido_1: 'adminUsuarioApellidoPaterno',
    apellido_2: 'adminUsuarioApellidoMaterno', email: 'adminUsuarioEmail', rol_id: 'adminUsuarioRol', rut: 'adminUsuarioRut',
    cargo: 'adminUsuarioCargo', obras_ids: 'adminUsuarioObras',
  },
} as const satisfies Record<string, Record<string, string>>;

export interface ParsedError { message: string; fields: string[] }

const DUPLICATE_HINT = 'Es posible que ya exista un registro con los mismos datos.';

/**
 * Convierte el error de una mutación en mensaje + ids de campos con error.
 * - 422: mensajes de Pydantic (sin "Value error, ") unidos con ", " y campos según `loc`.
 * - 400/404: `detail` string tal cual (p. ej. "El email ya está registrado").
 * - 500 (ErrorMiddleware, sin detail): mensaje del servidor + pista de duplicado.
 *   Cambio vs legacy: antes se mostraba solo el genérico "Error al crear …".
 */
export function parseMutationError(err: unknown, fieldMap: Record<string, string>, fallback: string, hint500 = DUPLICATE_HINT): ParsedError {
  if (!(err instanceof ApiError)) return { message: (err as Error)?.message || fallback, fields: [] };
  if (err.kind !== 'http') return { message: err.message || fallback, fields: [] };
  const detail = err.body?.detail;
  const fields: string[] = [];
  if (Array.isArray(detail)) {
    for (const d of detail as Array<{ loc?: unknown[] }>) {
      const last = Array.isArray(d?.loc) && d.loc.length ? String(d.loc[d.loc.length - 1]) : null;
      // loc de listas termina en índice numérico (obras_ids, 0) → usar el nombre del campo.
      const key = last !== null && /^\d+$/.test(last) && d.loc!.length > 1 ? String(d.loc![d.loc!.length - 2]) : last;
      const id = key ? fieldMap[key] : undefined;
      if (id && !fields.includes(id)) fields.push(id);
    }
    const unique = [...new Set((parsePydanticErrors(detail) ?? '').split(', ').filter(Boolean))].join(', ');
    return { message: unique || fallback, fields };
  }
  if (typeof detail === 'string' && detail.trim()) return { message: detail.replace(/^Value error, /, ''), fields };
  if (err.status >= 500) return { message: [err.message || fallback, hint500].filter(Boolean).join(' '), fields };
  return { message: err.message || fallback, fields };
}

/**
 * saveEmpresa (admin.js:428-435): reescritura de mensajes.
 * Cambio vs legacy: también detecta "máximo" con tilde (el backend lo envía así; antes nunca se activaba).
 */
export function rewriteEmpresaError(msg: string): string {
  if (msg.includes('maximo') || msg.includes('máximo') || msg.includes('limit')) return 'El nombre o código es demasiado largo.';
  if (msg.toLowerCase().includes('ya está registrado')) return 'Ya existe una empresa con ese nombre o código.';
  return msg;
}

/** Mensaje para delete/reset (data.js: `result.detail || fallback`), sin "[object Object]". */
export function simpleErrorMessage(err: unknown, fallback: string): string {
  return parseMutationError(err, {}, fallback, '').message;
}
