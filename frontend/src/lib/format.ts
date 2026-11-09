/** Formateadores idénticos a utils.js del frontend original. */
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
const intCl = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export function formatCurrency(amount: number | string | null | undefined): string {
  return clp.format(Number(amount ?? NaN));
}

/** Número entero con separador de miles es-CL (folio.js updateTotalMonto). */
export function formatInteger(n: number): string {
  return intCl.format(n);
}

/** Solo dígitos → entero (los montos se ingresan como texto con separadores). */
export function parseDigits(value: string | number | null | undefined): number {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  // Fechas YYYY-MM-DD: mediodía local para evitar desfase de zona horaria.
  const normalized = dateString.includes('T') ? dateString : `${dateString}T12:00:00`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('es-CL');
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('es-CL');
}

/** Fecha local de hoy en formato YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const BADGES: Record<string, string> = {
  PENDIENTE: 'badge-pending',
  ESPERANDO: 'badge-waiting',
  'APROBADO NIVEL 1': 'badge-approved-n1',
  'APROBADO NIVEL 2': 'badge-approved-n2',
  'APROBADO FINANZAS': 'badge-approved-finanzas',
  RECHAZADO: 'badge-rejected',
  RECEPCIONADO: 'badge-paid',
};

export function getBadgeClass(estado: string | null | undefined): string {
  if (!estado) return 'badge-pending';
  return BADGES[estado.toUpperCase().trim()] ?? 'badge-pending';
}

/** Slug usado en ids de tarjetas por empresa (app.js: lowercase + espacios→'-'). */
export function slugify(s: string): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '-');
}
