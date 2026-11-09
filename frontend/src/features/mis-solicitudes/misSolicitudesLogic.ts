/** Lógica pura de "Mis Solicitudes" (app.js loadMisSolicitudes 1138-1381, updateButtonState 1642-1685). */
import { isOwner, isRRHHHigh } from '@/lib/roles';
import type { Solicitud } from '@/lib/solicitud';
import type { CurrentUser } from '@/types/domain';
import { groupBy } from '@/features/solicitud-detalle/listUtils';
import { slugify } from '@/lib/format';

export const TIPOS = ['Mis Solicitudes', 'Recepcionado'] as const;
export type TipoSolicitud = (typeof TIPOS)[number];

/**
 * Regla de la carga inicial (app.js:1153-1180), aplicada de forma consistente en todos los caminos
 * (Cambio vs legacy: el filtro por Año/Mes y la paginación usaban otros conjuntos de estados — bug #10):
 *  (ADMINISTRADOR | ADMIN | SUPERVISOR | cargo/rol RRHH alto | dueño por id estricto o nombre) Y estado ∈ {RECHAZADO, ESPERANDO}.
 */
export function misSolicitudesVisibles(rows: Solicitud[], user: CurrentUser): Solicitud[] {
  const role = (user.rol || '').toUpperCase();
  const all = role === 'ADMINISTRADOR' || role === 'ADMIN' || role === 'SUPERVISOR' || isRRHHHigh(user);
  return rows.filter((s) => {
    const est = (s.estado || '').toUpperCase();
    return (all || isOwner(s, user)) && (est === 'RECHAZADO' || est === 'ESPERANDO');
  });
}

export interface GrupoEmpresaTipo { empresa: string; tipo: TipoSolicitud; cardId: string; rows: Solicitud[] }

/** Una tarjeta por empresa × tipo no vacío, en orden de aparición de la empresa y luego "Mis Solicitudes", "Recepcionado". */
export function agruparPorEmpresaYTipo(rows: Solicitud[]): GrupoEmpresaTipo[] {
  const out: GrupoEmpresaTipo[] = [];
  for (const [empresa, list] of groupBy(rows, (s) => s.empresaNombre)) {
    for (const tipo of TIPOS) {
      // Cambio vs legacy: un tipo_solicitud desconocido se ignora (el original lanzaba excepción y no mostraba nada).
      const sub = list.filter((s) => (s.tipo_solicitud || 'Mis Solicitudes') === tipo);
      if (!sub.length) continue;
      out.push({ empresa, tipo, cardId: `${slugify(empresa)}-${tipo === 'Mis Solicitudes' ? 'solicitudes' : 'recepcionado'}`, rows: sub });
    }
  }
  return out;
}

/** "Enviar a Aprobación" habilitado solo si hay ≥1 marcada y TODAS están en "Esperando" (app.js:1667-1684). */
export function puedeEnviar(seleccionadas: Array<{ estado: string }>): boolean {
  return seleccionadas.length > 0 && seleccionadas.every((s) => s.estado === 'Esperando');
}
