/** Operaciones HTTP del workflow (sin React) + utilidades de error. Todas pasan por @/api/endpoints. */
import { ApiError } from '@/api/client';
import { recepcionadoApi, solicitudesApi } from '@/api/endpoints';
import type { Solicitud } from '@/lib/solicitud';
import { todayISO } from '@/lib/format';
import { buildRecepcionadoPayload } from '@/features/finanzas/finanzasLogic';
import type { TransitionPayload } from './workflowLogic';

export const isConnectionError = (e: unknown) => e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout');

/** Equivalente a `result.detail || fallback` del original (detail de texto; si no, mensaje ya extraído por el cliente). */
export function errorDetail(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const d = e.body?.detail;
    if (typeof d === 'string' && d.trim()) return d;
    return e.message || fallback;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Mensaje de la ruta (las rutas PDF devuelven {status, message, pdf_path} dentro de `data`). */
export function routeMessage(data: unknown, fallback: string): string {
  const m = data && typeof data === 'object' ? (data as { message?: unknown }).message : undefined;
  return typeof m === 'string' && m.trim() ? m : fallback;
}

export const patchTransition = (id: number, body: TransitionPayload) => solicitudesApi.patch(id, body as unknown as Record<string, unknown>);

export interface MassResult { ok: number; failed: number; errors: string[] }

/** Ejecuta tareas en secuencia (sin refetch por ítem) y acumula éxitos/errores. */
export async function runSequential<T>(items: T[], task: (item: T) => Promise<'ok' | 'skip'>): Promise<MassResult> {
  const res: MassResult = { ok: 0, failed: 0, errors: [] };
  for (const it of items) {
    try {
      const r = await task(it);
      if (r === 'ok') res.ok++;
      else res.failed++;
    } catch (e) {
      res.failed++;
      res.errors.push(errorDetail(e, 'Error desconocido'));
    }
  }
  return res;
}

export class RecepcionDeleteError extends Error {}

/**
 * ejecutarRecepcionCore (W:1609-1678): POST /recepcionado y luego DELETE /todas_solicitudes/{id}?preserve_files=true.
 * Cambio vs legacy: si el DELETE falla, ya NO se informa éxito (B-6): se lanza RecepcionDeleteError con un mensaje claro
 * (la solicitud quedó copiada en Recepcionado pero sigue activa). Se mantiene el orden de las dos llamadas.
 */
export async function recepcionar(s: Solicitud): Promise<void> {
  await recepcionadoApi.create(buildRecepcionadoPayload(s, todayISO()));
  try {
    await solicitudesApi.remove(s.id, true);
  } catch (e) {
    throw new RecepcionDeleteError(
      `La solicitud #${s.id} se registró en Recepcionado, pero no se pudo quitar de las solicitudes activas: ${errorDetail(e, 'Error al eliminar solicitud')}`,
    );
  }
}
