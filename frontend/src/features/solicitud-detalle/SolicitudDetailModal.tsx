/**
 * Modal "Detalle de Solicitud #id" (app.js verDetalleSolicitud 1990-2398 + eliminarSolicitud 2443-2522).
 * CONTRATO compartido: default export ({ solicitud, isRecepcionado?, onClose }).
 */
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { solicitudesApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { qk, useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';
import type { Recepcionado, Solicitud } from '@/lib/solicitud';
import EditSolicitudModal from '@/features/solicitud-edicion/EditSolicitudModal';
import { canDeleteSolicitud, canEditSolicitud, editLabel, toDetailView } from './detailRules';
import { Comments, FoliosBreakdown, GeneralInfo, InfoContable, VoucherHeader } from './DetailSections';

export interface SolicitudDetailModalProps {
  solicitud: Solicitud | Recepcionado;
  isRecepcionado?: boolean;
  onClose: () => void;
}

export default function SolicitudDetailModal({ solicitud, isRecepcionado = false, onClose }: SolicitudDetailModalProps) {
  const v = useMemo(() => toDetailView(solicitud, isRecepcionado), [solicitud, isRecepcionado]);
  const notify = useToast();
  const dialog = useDialog();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = useRef(false); // confirmación/eliminación en curso: ESC/fondo no cierran el modal
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  // Cambio vs legacy: cierre con ESC (el original solo cerraba con × y "Cerrar Detalle").
  useEffect(() => {
    if (editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy.current) closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  // Cambio vs legacy: en registros de la tabla /recepcionado no se ofrecen "Editar"/"Eliminar" porque el original
  // buscaba/eliminaba por ese id en /todas_solicitudes (tabla distinta) → afectaría otra solicitud con el mismo id.
  const showEdit = !isRecepcionado && canEditSolicitud(v);
  const showDelete = !isRecepcionado && canDeleteSolicitud(v);

  async function eliminar() {
    if (busy.current) return;
    busy.current = true;
    try {
      const ok = await dialog.confirm('Eliminar Solicitud', '¿Está seguro de que desea eliminar esta solicitud? Esta acción no se puede deshacer.');
      if (!ok) return;
      setDeleting(true);
      try {
        await solicitudesApi.remove(v.id);
        notify('Solicitud eliminada exitosamente', 'success');
        closeRef.current();
        await invalidate(qk.solicitudes);
      } catch (e) {
        if (e instanceof ApiError) notify(`Error al eliminar la solicitud: ${e.message}`, 'error');
        else notify('Ocurrió un error inesperado al intentar eliminar la solicitud', 'error');
      } finally {
        setDeleting(false);
      }
    } finally {
      busy.current = false;
    }
  }

  // El original eliminaba el detalle al abrir la edición (forms.js:1481).
  if (editing) return <EditSolicitudModal solicitud={solicitud as Solicitud} onClose={onClose} onSaved={onClose} />;

  // Portal: el modal se monta en <body> para no quedar atrapado en el contexto de apilamiento de la sección.
  return createPortal(
    <div id="detailModal" data-testid="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detailModalTitle"
      className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] flex items-center justify-center z-[1000] p-0 sm:p-4"
      // Cambio vs legacy: clic en el fondo cierra el modal.
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy.current) onClose(); }}>
      <div className="bg-white w-full sm:max-w-5xl max-h-[100dvh] sm:max-h-[90vh] sm:rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border)] bg-white shrink-0 relative z-10">
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0"><i className="fas fa-file-invoice" aria-hidden="true" /></div>
              <div className="min-w-0">
                <h3 id="detailModalTitle" className="text-lg font-semibold text-slate-900 break-words">Detalle de Solicitud #{v.id}</h3>
                <p className="text-sm text-slate-500 truncate">Emitido por: {v.solicitanteNombre}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar" data-testid="detail-close-x"
              className="ui-icon-btn">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-5 flex-1 min-h-0 overflow-y-auto space-y-6 bg-[var(--bg-primary)]">
          <VoucherHeader v={v} />
          <GeneralInfo v={v} />
          <FoliosBreakdown v={v} />
          <InfoContable v={v} />
          <Comments v={v} />
        </div>

        <div className="px-5 sm:px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] shrink-0 flex flex-col sm:flex-row sm:justify-end gap-2">
          {showEdit && (
            <button type="button" data-testid="detail-edit" onClick={() => setEditing(true)} disabled={deleting}
              className="ui-btn ui-btn-primary sm:order-last">
              <i className="fas fa-edit" aria-hidden="true" />{editLabel(v)}
            </button>
          )}
          {showDelete && (
            <button type="button" data-testid="detail-delete" onClick={eliminar} disabled={deleting}
              className="ui-btn ui-btn-danger-outline sm:order-first sm:mr-auto">
              <i className={`fas ${deleting ? 'fa-spinner fa-spin' : 'fa-trash-alt'}`} aria-hidden="true" />Eliminar Solicitud
            </button>
          )}
          <button type="button" onClick={onClose} data-testid="detail-close"
            className="ui-btn ui-btn-secondary">
            Cerrar Detalle
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
