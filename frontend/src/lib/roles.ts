import type { CurrentUser, SessionUser } from '@/types/domain';

/**
 * Reglas de visibilidad por rol/cargo — réplica EXACTA de app.js (setupMenuByRole y filtros por rol).
 * IMPORTANTE: son controles de UI. La autorización real es responsabilidad del backend
 * (ver informe: varias reglas de negocio solo existen en el cliente — problema preexistente).
 */

export type SectionKey =
  | 'dashboard' | 'nuevaSolicitud' | 'misSolicitudes' | 'aprobaciones' | 'aprobaciones2' | 'finanzas'
  | 'todasSolicitudes' | 'recepcionado' | 'reportes' | 'administracion' | 'seguridad';

export function toCurrentUser(s: SessionUser): CurrentUser {
  return {
    id: parseInt(String(s.sub), 10),
    email: s.email,
    nombre: `${s.primer_nombre || ''} ${s.segundo_nombre || ''} ${s.primer_apellido || ''} ${s.segundo_apellido || ''}`.trim(),
    primer_nombre: s.primer_nombre || '',
    segundo_nombre: s.segundo_nombre || '',
    primer_apellido: s.primer_apellido || '',
    segundo_apellido: s.segundo_apellido || '',
    rol: s.rol_nombre || '',
    rol_id: s.rol_id ?? null,
    rut: s.rut || '',
    cargo: s.cargo || '',
    exp: s.exp,
  };
}

/** Menús visibles (app.js:534-593). Dashboard, Mis Solicitudes, Recepcionado y Seguridad: todos. */
export function visibleSections(user: Pick<CurrentUser, 'rol' | 'cargo'>): Set<SectionKey> {
  const s = new Set<SectionKey>(['dashboard', 'misSolicitudes', 'recepcionado', 'seguridad']);
  const { rol: role, cargo } = user;
  const add = (...k: SectionKey[]) => k.forEach((x) => s.add(x));
  if (role === 'Administrador') add('nuevaSolicitud', 'aprobaciones', 'aprobaciones2', 'finanzas', 'todasSolicitudes', 'reportes', 'administracion');
  else if (role === 'Solicitante') add('nuevaSolicitud', 'todasSolicitudes');
  else if (role === 'Aprobador') {
    if (cargo === 'Jefe de Recursos Humanos') add('nuevaSolicitud', 'aprobaciones', 'todasSolicitudes');
    else if (cargo === 'Subgerente de Capital Humano') add('aprobaciones2', 'todasSolicitudes');
  } else if (role === 'Jefe de Recursos Humanos') add('aprobaciones', 'todasSolicitudes');
  else if (role === 'Subgerente de Capital Humano') add('aprobaciones2', 'todasSolicitudes');
  else if (role === 'Jefe de Finanzas' || cargo === 'Jefe de Finanzas') add('finanzas', 'reportes');
  return s;
}

const up = (v: string | null | undefined) => (v || '').toUpperCase();

/** Cargos/roles RRHH de alta visibilidad (app.js:1155-1165). */
export function isRRHHHigh(user: Pick<CurrentUser, 'rol' | 'cargo'>): boolean {
  const role = up(user.rol);
  const cargo = up(user.cargo);
  return (
    role.includes('RRHH') || role.includes('RECURSOS HUMANOS') || role.includes('CAPITAL HUMANO') ||
    cargo.includes('RRHH') || cargo.includes('RECURSOS HUMANOS') || cargo.includes('CAPITAL HUMANO')
  );
}

/** "Alta visibilidad" (app.js:908-924 / 1776-1791): ve solicitudes de todos. */
export function isHighVisibility(user: Pick<CurrentUser, 'rol' | 'cargo'>): boolean {
  const role = up(user.rol);
  const cargo = up(user.cargo);
  return (
    role === 'ADMINISTRADOR' || role === 'ADMIN' || role === 'SUPERVISOR' || isRRHHHigh(user) ||
    role.includes('FINANZAS') || cargo.includes('FINANZAS')
  );
}

export function isSolicitante(user: Pick<CurrentUser, 'rol'>): boolean {
  return up(user.rol) === 'SOLICITANTE';
}

/** ¿La solicitud pertenece al usuario? (id estricto o nombre completo case-insensitive). */
export function isOwner(s: { solicitanteId: number | null; solicitanteNombre?: string | null }, user: CurrentUser, looseId = false): boolean {
  const idMatch = looseId ? s.solicitanteId == user.id : s.solicitanteId === user.id;
  return idMatch || (!!s.solicitanteNombre && !!user.nombre && s.solicitanteNombre.toLowerCase() === user.nombre.toLowerCase());
}
