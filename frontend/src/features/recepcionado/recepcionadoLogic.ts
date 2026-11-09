/** Lógica pura de "Solicitudes Recepcionadas" (app.js loadRecepcionado 672-900, frontend_pagination.js 153-200). */
import { isOwner } from '@/lib/roles';
import type { Recepcionado } from '@/lib/solicitud';
import type { CurrentUser } from '@/types/domain';
import { matchesPeriodo, type PeriodoFiltro } from '@/features/solicitud-detalle/listUtils';

/** Rol exacto "Solicitante" → solo propios (id laxo `==` o nombre) y estado ≠ "PAGADO"; otros roles → todos (app.js:681-690). */
export function recepcionadosVisibles(rows: Recepcionado[], user: CurrentUser): Recepcionado[] {
  if (user.rol !== 'Solicitante') return rows;
  return rows.filter((h) => isOwner({ solicitanteId: h.solicitanteId, solicitanteNombre: h.solicitante }, user, true) && h.estado !== 'PAGADO');
}

export interface EstadoChecks { recepcionado: boolean; pagado: boolean }

export interface RecepcionadoFiltro extends PeriodoFiltro { estados: EstadoChecks }

/** Los estados distintos de RECEPCIONADO/PAGADO siempre pasan el filtro de checkboxes. */
export function filtrarRecepcionado(rows: Recepcionado[], f: RecepcionadoFiltro): Recepcionado[] {
  return rows.filter((h) => {
    if (!matchesPeriodo(h, f)) return false;
    const est = (h.estado || '').toUpperCase();
    if (est === 'RECEPCIONADO') return f.estados.recepcionado;
    if (est === 'PAGADO') return f.estados.pagado;
    return true;
  });
}

/**
 * Aplica el cambio de un checkbox de estado. Debe quedar al menos uno marcado (validarFiltroEstadoRecepcionado):
 * devuelve `null` si el cambio dejaría ambos desmarcados (el llamador muestra la advertencia).
 */
export function toggleEstado(prev: EstadoChecks, key: keyof EstadoChecks, checked: boolean): EstadoChecks | null {
  const next = { ...prev, [key]: checked };
  return !next.recepcionado && !next.pagado ? null : next;
}

/** Columna "Modificar" visible si algún registro de la empresa (sin filtrar) no está PAGADO. */
export function hayEditables(rows: Recepcionado[]): boolean {
  return rows.some((r) => r.estado !== 'PAGADO');
}

/** Nombre de archivo y versión truncada (>15 → 12 + "...") como el original. */
export function pdfNames(path: string): { full: string; short: string } {
  const full = path.split('/').pop() || path;
  return { full, short: full.length > 15 ? `${full.substring(0, 12)}...` : full };
}
