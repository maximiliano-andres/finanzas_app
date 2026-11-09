import { ApiError } from '@/api/client';
import { parsePydanticErrors } from '@/lib/validation';

// Cambio vs legacy: errores 422/red con mensaje legible en vez de "[object Object]" / error de parseo JSON.
/**
 * Mensaje de error para "Error: ${msg}" (equivalente a `errorData.detail || fallback` del original).
 * - 422: lista de Pydantic legible (el original mostraba "[object Object]", B-26).
 * - 400/403/404…: `detail` del backend (p. ej. folio duplicado, permisos de obra).
 * - Red / timeout: mensaje del cliente HTTP (el original mostraba el error de parseo JSON).
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.kind !== 'http') return err.message || fallback;
    // Formato FastAPI ({detail}) o sobre del middleware de errores ({message, errors}).
    const detail = err.body?.detail ?? (err.status === 422 ? err.body?.errors : err.body?.message);
    if (err.status === 422) return parsePydanticErrors(detail) || fallback;
    if (typeof detail === 'string' && detail.trim()) return detail;
    return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Campos (último elemento de `loc`) con error en un 422 de FastAPI. */
export function pydanticErrorFields(err: unknown): string[] {
  if (!(err instanceof ApiError) || err.status !== 422) return [];
  const list = err.body?.detail ?? err.body?.errors;
  if (!Array.isArray(list)) return [];
  return (list as Array<{ loc?: unknown[] }>)
    .map((d) => (Array.isArray(d?.loc) ? String(d.loc[d.loc.length - 1]) : ''))
    .filter(Boolean);
}
