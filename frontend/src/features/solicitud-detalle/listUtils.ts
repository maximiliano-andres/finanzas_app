/**
 * Utilidades puras compartidas por los listados (Mis Solicitudes, Recepcionado, Todas, Dashboard).
 * Réplica de app.js (filtros Año/Mes/F. Pago) y frontend_pagination.js.
 */
import { formatDate } from '@/lib/format';
import { MESES } from '@/types/domain';

export interface PeriodoRow {
  anio?: number | null;
  mesProceso?: string | null;
  fechaPago?: string | null;
}

export interface PeriodoFiltro {
  anio: string; // 'todos' | año
  mes: string; // 'todos' | mes
  pago: string; // 'todos' | fecha formateada es-CL
}

export const PERIODO_TODOS: PeriodoFiltro = { anio: 'todos', mes: 'todos', pago: 'todos' };

/** Opciones de los selects Año (desc), Mes (orden calendario, solo presentes) y F. Pago (formateadas, orden string) — app.js:742-760 / 1233-1250. */
export function periodoOptions(rows: PeriodoRow[]) {
  // Cambio vs legacy: se omiten años nulos (el original generaba una opción "null"/"undefined").
  const anios = [...new Set(rows.map((r) => r.anio).filter((a): a is number => a != null))].sort((a, b) => b - a);
  const meses = MESES.filter((m) => rows.some((r) => r.mesProceso === m));
  const pagos = [...new Set(rows.map((r) => formatDate(r.fechaPago)))].sort();
  return { anios, meses: [...meses], pagos };
}

/** Coincidencia Año/Mes/F. Pago (frontend_pagination.js:164-170). */
export function matchesPeriodo(r: PeriodoRow, f: PeriodoFiltro): boolean {
  const okAnio = f.anio === 'todos' || String(r.anio ?? '') === f.anio;
  const okMes = f.mes === 'todos' || r.mesProceso === f.mes;
  const okPago = f.pago === 'todos' || formatDate(r.fechaPago) === f.pago;
  return okAnio && okMes && okPago;
}

/** Suma de montos tolerante a strings ("$ 1.000") como updateButtonState (app.js:1652-1661). */
export function toMonto(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '');
  let n = parseFloat(s);
  if (Number.isNaN(n)) n = parseFloat(s.replace(/[^0-9.-]+/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

export function sumMonto(rows: Array<{ monto?: unknown }>): number {
  return rows.reduce((acc, r) => acc + toMonto(r.monto), 0);
}

/** Agrupa preservando el orden de primera aparición (igual que Object.entries sobre el objeto del original). */
export function groupBy<T>(rows: T[], key: (r: T) => string): Array<[string, T[]]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return [...m.entries()];
}

/** Parte fecha YYYY-MM-DD de un valor ISO (para comparar rangos sin desfase horario). */
export function datePart(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (m) return m[1];
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
