import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { useToast } from './ToastProvider';

/**
 * Notifica errores de CARGA de datos (queries) de forma uniforme.
 * El original tragaba estos errores en consola y mostraba datos cacheados en localStorage sin avisar.
 * - 401: lo maneja el handler global (redirección a login) → no se duplica aviso.
 * - 403 con redirect_to: lo maneja el handler de seguridad.
 * - La consulta de sesión tiene su propia pantalla de error.
 */
export function QueryErrorNotifier() {
  const qc = useQueryClient();
  const notify = useToast();
  useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      if (event.query.queryKey[0] === 'session') return;
      const err = event.action.error;
      if (err instanceof ApiError && (err.status === 401 || (err.status === 403 && err.redirectTo) || err.kind === 'aborted')) return;
      const msg = err instanceof ApiError ? err.message : 'Error inesperado.';
      notify(`Error al cargar datos: ${msg}`, 'error');
    });
  }, [qc, notify]);
  return null;
}
