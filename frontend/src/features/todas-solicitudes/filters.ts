/** Filtros de "Estados de Solicitudes" (app.js filtrarSolicitudes 1771-1889). */
import { isHighVisibility, isOwner, isSolicitante } from '@/lib/roles';
import type { Solicitud } from '@/lib/solicitud';
import type { CurrentUser } from '@/types/domain';
import { datePart } from '@/features/solicitud-detalle/listUtils';

export interface Criterios {
  texto: string;
  estado: string;
  fechaDesde: string;
  fechaHasta: string;
  fechaPagoDesde: string;
  fechaPagoHasta: string;
  montoMin: string;
  montoMax: string;
}

export const CRITERIOS_VACIOS: Criterios = {
  texto: '', estado: '', fechaDesde: '', fechaHasta: '', fechaPagoDesde: '', fechaPagoHasta: '', montoMin: '', montoMax: '',
};

/**
 * Opciones de #filtroEstado. Cambio vs legacy (bug #7): los valores coinciden con el estado normalizado
 * ("Aprobado nivel 2", "Aprobado finanzas"); antes "APROBADO NIVEL 2"/"APROBADO FINANZAS" nunca coincidían.
 */
export const ESTADO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'Esperando', label: 'Esperando' },
  { value: 'Pendiente', label: 'Pendiente' },
  { value: 'Aprobado Nivel 1', label: 'Aprobado Nivel 1' },
  { value: 'Aprobado nivel 2', label: 'Aprobado Nivel 2' },
  { value: 'Aprobado finanzas', label: 'Aprobado Finanzas' },
  { value: 'Rechazado', label: 'Rechazado' },
  { value: 'Pagado', label: 'Pagado' },
];

/** Solicitante sin alta visibilidad → solo propias (id estricto o nombre); el resto de roles → todas (app.js:1794-1803). */
export function visiblesTodas(rows: Solicitud[], user: CurrentUser): Solicitud[] {
  if (!isHighVisibility(user) && isSolicitante(user)) return rows.filter((s) => isOwner(s, user));
  return rows;
}

function montoNum(m: unknown): number {
  return typeof m === 'string' ? parseFloat(m.replace(/[^0-9.-]+/g, '')) : parseFloat(String(m));
}

/**
 * Rango de fechas inclusivo en ambos extremos, comparando la parte YYYY-MM-DD.
 * Cambio vs legacy (bug #29): sin desfase de zona horaria (antes `new Date('YYYY-MM-DD')` UTC vs hora local).
 */
function inRange(value: string | null | undefined, desde: string, hasta: string): boolean {
  if (!desde.trim() && !hasta.trim()) return true;
  const d = datePart(value);
  if (!d) return false;
  if (desde.trim() && d < desde) return false;
  if (hasta.trim() && d > hasta) return false;
  return true;
}

export function filtrarSolicitudes(rows: Solicitud[], c: Criterios): Solicitud[] {
  const texto = c.texto.toLowerCase().trim();
  const min = c.montoMin.trim() ? parseFloat(c.montoMin) : NaN;
  const max = c.montoMax.trim() ? parseFloat(c.montoMax) : NaN;
  return rows.filter((s) => {
    if (texto) {
      const hit =
        (!!s.id && s.id.toString().includes(texto)) ||
        (!!s.solicitanteNombre && s.solicitanteNombre.toLowerCase().includes(texto)) ||
        (!!s.empresaNombre && s.empresaNombre.toLowerCase().includes(texto)) ||
        (!!s.procesoNombre && s.procesoNombre.toLowerCase().includes(texto));
      if (!hit) return false;
    }
    if (c.estado.trim() && s.estado !== c.estado) return false;
    if (!inRange(s.fechaProceso, c.fechaDesde, c.fechaHasta)) return false;
    if (!Number.isNaN(min) || !Number.isNaN(max)) {
      const v = montoNum(s.monto);
      if (Number.isNaN(v)) return false;
      if (!Number.isNaN(min) && v < min) return false;
      if (!Number.isNaN(max) && v > max) return false;
    }
    if (!inRange(s.fechaPago, c.fechaPagoDesde, c.fechaPagoHasta)) return false;
    return true;
  });
}
