import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

/** #actionModal (Workflow.createActionModal, W:1323-1399). */
export interface ActionModalProps {
  accion: 'aprobar' | 'devolver';
  /** Estado destino para el texto de "aprobar". */
  targetEstado?: string;
  onClose: () => void;
  /** Debe resolver al terminar; si lanza, el modal se mantiene abierto para reintentar. */
  onConfirm: (comentarios: string) => Promise<void>;
}

const CONFIG = {
  aprobar: { title: 'Aprobar Solicitud', icon: 'fa-check-circle', tile: 'bg-[var(--success-bg)] text-[var(--success)]', btnClass: 'ui-btn-success' },
  devolver: { title: 'Devolver Solicitud', icon: 'fa-undo', tile: 'bg-[var(--warning-bg)] text-[var(--warning)]', btnClass: 'ui-btn-primary' },
};

export default function ActionModal({ accion, targetEstado = 'Aprobado Nivel 1', onClose, onConfirm }: ActionModalProps) {
  const [comentarios, setComentarios] = useState('');
  const [saving, setSaving] = useState(false);
  const { title, icon, tile, btnClass } = CONFIG[accion];
  // Cambio vs legacy: el texto de "aprobar" indica el estado destino real (el original siempre decía "Aprobado Nivel 1", B-9).
  const description =
    accion === 'aprobar'
      ? `La solicitud será aprobada y avanzará a la siguiente etapa en un estado de "${targetEstado}".`
      : 'La solicitud será devuelta al solicitante o a la etapa anterior para que se realicen correcciones.';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm(comentarios);
    } finally {
      setSaving(false);
    }
  };

  // Portal: el modal se monta en <body> para no quedar atrapado en el contexto de apilamiento de la sección.
  return createPortal(
    <div id="actionModal" className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] flex items-center justify-center z-[1000] p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-labelledby="actionModalTitle">
      <div className="bg-white w-full sm:max-w-lg max-h-[100dvh] sm:max-h-[90vh] sm:rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border)] flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg ${tile} flex items-center justify-center shrink-0`}><i className={`fas ${icon}`} aria-hidden="true" /></div>
          <div className="min-w-0">
            <h3 id="actionModalTitle" className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-5 overflow-y-auto">
          <div>
            <label htmlFor="comentariosAccion" className="ui-label flex items-center gap-2">
              <i className="fas fa-comment-dots text-slate-400" aria-hidden="true" /> Comentarios / Observaciones
            </label>
            <textarea id="comentariosAccion" rows={4} value={comentarios} onChange={(e) => setComentarios(e.target.value)}
              className="ui-input w-full"
              placeholder="Escriba aquí sus observaciones para el historial..." />
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="ui-btn ui-btn-secondary">
            <i className="fas fa-times" aria-hidden="true" /> Cancelar
          </button>
          <button type="button" id="btnConfirmarAccion" data-testid="btn-confirmar-accion" onClick={confirm} disabled={saving}
            className={`ui-btn ${btnClass}`}>
            {saving ? (<><i className="fas fa-spinner fa-spin" aria-hidden="true" />Guardando...</>) : (<><i className="fas fa-check" aria-hidden="true" /> Confirmar Acción</>)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
