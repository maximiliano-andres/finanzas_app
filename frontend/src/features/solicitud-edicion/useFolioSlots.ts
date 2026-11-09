import { useCallback, useState } from 'react';
import { ApiError } from '@/api/client';
import { recepcionadoApi, solicitudesApi } from '@/api/endpoints';
import { qk, useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';
import type { SolicitudApi } from '@/types/domain';
import { FOLIO_SUFFIXES, clearSlotPatch, slotsFromRecord, EMPTY_SLOT, type FolioSlot } from './cuadratura';
import { apiErrorMessage } from './errors';
import { formatMontoInput } from '@/features/nueva-solicitud/logic';

export type EditKind = 'solicitud' | 'recepcionado';

/** Diferencias entre ambos modales (C-3/C-5/C-6 vs C-8/C-10). */
const ADAPTERS = {
  solicitud: {
    api: solicitudesApi,
    key: qk.solicitudes,
    patchError: 'Error al actualizar la solicitud en el servidor',
  },
  recepcionado: {
    api: recepcionadoApi,
    key: qk.recepcionado,
    patchError: 'Error al actualizar el registro en el servidor',
  },
} as const;

/**
 * Estado y acciones de los 5 slots de folio (Limpiar, Subir PDF, Eliminar PDF) compartidos por ambos modales.
 * Mensajes literales del original (forms.js 1268-1340, 1889-1958, 2418-2630).
 */
export function useFolioSlots(kind: EditKind, record: SolicitudApi) {
  const adapter = ADAPTERS[kind];
  const notify = useToast();
  const dialog = useDialog();
  const invalidate = useInvalidate();
  const [slots, setSlots] = useState<FolioSlot[]>(() => slotsFromRecord(record));
  const [busy, setBusy] = useState<boolean[]>(() => FOLIO_SUFFIXES.map(() => false));

  const setSlot = useCallback((i: number, patch: Partial<FolioSlot>) => {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }, []);
  const setBusyAt = (i: number, v: boolean) => setBusy((prev) => prev.map((b, j) => (j === i ? v : b)));

  /** Edición de un campo; los montos se enmascaran al escribir (formatMontoInput). */
  const editField = (i: number, field: 'folio' | 'monto' | 'formaPago', value: string) =>
    setSlot(i, { [field]: field === 'monto' ? formatMontoInput(value) : value });

  /** eliminarPDFFolio* con `confirmed=true`: los errores se notifican y no se propagan (como el original). */
  const deletePdfCore = async (i: number, pdfPath: string): Promise<void> => {
    const field = `pdf_folio_${FOLIO_SUFFIXES[i]}`;
    try {
      await adapter.api.deletePdf(record.id, field, pdfPath);
      setSlot(i, { pdf: '' });
      notify('PDF eliminado exitosamente', 'success');
    } catch (err) {
      notify(`Error: ${apiErrorMessage(err, 'Error al eliminar el PDF')}`, 'error');
    }
  };

  const deletePdf = async (i: number) => {
    const pdfPath = slots[i].pdf;
    if (!pdfPath || busy[i]) return;
    const name = pdfPath.split('/').pop();
    const ok = await dialog.confirm('Eliminar PDF', `¿Está seguro de eliminar el PDF "${name}"? Esta acción no se puede deshacer y borrará el archivo físico.`);
    if (!ok) return;
    setBusyAt(i, true);
    try {
      await deletePdfCore(i, pdfPath);
      await invalidate(adapter.key);
    } finally {
      setBusyAt(i, false);
    }
  };

  const uploadPdf = async (i: number, file: File | undefined) => {
    if (!file || busy[i]) return;
    if (file.type !== 'application/pdf') {
      notify('Solo se permiten archivos PDF', 'error');
      return;
    }
    setBusyAt(i, true);
    try {
      const res = (await adapter.api.uploadPdf(record.id, `pdf_folio_${FOLIO_SUFFIXES[i]}`, file)) as { pdf_path?: string } | null;
      if (res?.pdf_path) setSlot(i, { pdf: String(res.pdf_path) });
      await invalidate(adapter.key);
      notify('PDF subido exitosamente', 'success');
    } catch (err) {
      notify(`Error: ${apiErrorMessage(err, 'Error al subir el PDF')}`, 'error');
    } finally {
      setBusyAt(i, false);
    }
  };

  /** "Limpiar" un folio: confirmación, limpieza optimista, PATCH, borrado del PDF y sincronización. */
  const clearSlot = async (i: number) => {
    if (busy[i]) return;
    const num = FOLIO_SUFFIXES[i].toUpperCase();
    const ok = await dialog.confirm('Limpiar Folio', `¿Está seguro de que desea limpiar todos los datos del Folio ${num}?`);
    if (!ok) return;
    const pdfPath = slots[i].pdf;
    // Optimista y sin rollback si el servidor falla (comportamiento original, B-20).
    setSlot(i, EMPTY_SLOT);
    notify(`Folio ${num} limpiado`, 'info');
    setBusyAt(i, true);
    try {
      try {
        await adapter.api.patch(record.id, clearSlotPatch(FOLIO_SUFFIXES[i]));
      } catch (err) {
        // Respuesta HTTP no-ok → texto fijo del original; error de red → su mensaje.
        const msg = err instanceof ApiError && err.kind !== 'http' ? err.message : adapter.patchError;
        notify(`Error al guardar cambios en el servidor: ${msg}`, 'error');
        return;
      }
      if (pdfPath) await deletePdfCore(i, pdfPath);
      await invalidate(adapter.key);
      notify(`Folio ${num} sincronizado con éxito`, 'success');
    } finally {
      setBusyAt(i, false);
    }
  };

  return { slots, busy, editField, clearSlot, uploadPdf, deletePdf };
}
