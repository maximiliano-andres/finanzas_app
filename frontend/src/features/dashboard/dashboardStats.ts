/** Lógica pura del Dashboard HOME (app.js loadDashboard 903-1050). */
import { isHighVisibility, isOwner, isSolicitante } from '@/lib/roles';
import type { Solicitud } from '@/lib/solicitud';
import type { CurrentUser } from '@/types/domain';

/** Alta visibilidad → todas; SOLICITANTE → propias (id laxo `==` o nombre); resto → ninguna (app.js:904-939). */
export function dashboardSolicitudes(rows: Solicitud[], user: CurrentUser): Solicitud[] {
  if (isHighVisibility(user)) return rows;
  if (isSolicitante(user)) return rows.filter((s) => isOwner(s, user, true));
  return [];
}

export interface DashboardStats { pendientes: number; aprobadas: number; rechazadas: number; total: number }

/** Conteos exactos (app.js:941-961) sobre el estado normalizado en mayúsculas. */
export function dashboardStats(rows: Array<{ estado?: string | null }>): DashboardStats {
  let pendientes = 0;
  let aprobadas = 0;
  let rechazadas = 0;
  for (const s of rows) {
    const est = (s.estado || '').toUpperCase();
    if (est === 'PENDIENTE' || est === 'ESPERANDO') pendientes++;
    if (est.includes('APROBADO') || est === 'RECEPCIONADO' || est === 'COMPLETADO') aprobadas++;
    if (est === 'RECHAZADO') rechazadas++;
  }
  return { pendientes, aprobadas, rechazadas, total: rows.length };
}

/** Últimas 5 por posición en el arreglo, invertidas (app.js:964). */
export function recientes<T>(rows: T[]): T[] {
  return rows.slice(-5).reverse();
}
