/** Envío masivo a aprobación (app.js enviarSolicitudesSeleccionadas 1690-1739). */
import { useState } from 'react';
import { solicitudesApi } from '@/api/endpoints';
import { qk, useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';

export function useEnviarAprobacion() {
  const notify = useToast();
  const dialog = useDialog();
  const invalidate = useInvalidate();
  const [sending, setSending] = useState(false);

  /** Devuelve true si se ejecutó el envío (para limpiar la selección). */
  async function enviar(ids: number[]): Promise<boolean> {
    if (!ids.length || sending) return false;
    const ok = await dialog.confirm('Enviar para Aprobación', `¿Está seguro de enviar ${ids.length} solicitud(es) para su aprobación?`);
    if (!ok) return false;
    setSending(true);
    notify('Iniciando envío de solicitudes...', 'info');
    let exitos = 0;
    let errores = 0;
    try {
      for (const id of ids) {
        try {
          await solicitudesApi.patch(id, { estado: 'PENDIENTE' });
          exitos++;
        } catch {
          errores++;
        }
      }
      if (exitos > 0) notify(`${exitos} solicitud(es) enviada(s) correctamente`, 'success');
      if (errores > 0) notify(`Hubo errores al enviar ${errores} solicitud(es)`, 'error');
      // Cambio vs legacy: una sola recarga al final (antes N+2 GET completos).
      await invalidate(qk.solicitudes);
    } finally {
      setSending(false);
    }
    return true;
  }

  return { enviar, sending };
}
