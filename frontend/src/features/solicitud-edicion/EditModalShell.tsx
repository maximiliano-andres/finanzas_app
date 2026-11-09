import { createPortal } from 'react-dom';
import { useId, type FormEvent, type ReactNode } from 'react';

/** Marco común de los modales de edición (forms.js 813-845 / 1483-1500). */
export function EditModalShell({ id, formId, icon, title, subtitle, onClose, onSubmit, children }: {
  id: string; formId: string; icon: string; title: string; subtitle: ReactNode;
  onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; children: ReactNode;
}) {
  const titleId = `${id}-title`;
  // Portal: el modal se monta en <body> para no quedar atrapado en el contexto de apilamiento de la sección.
  return createPortal(
    <div id={id} className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-0 sm:p-4 animate-fadeIn">
      <div role="dialog" data-testid="edit-modal" aria-modal="true" aria-labelledby={titleId}
        className="bg-white w-full sm:max-w-6xl max-h-[100dvh] sm:max-h-[90vh] sm:rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden animate-slideUp">
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border)] bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <i className={`fas ${icon}`} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            className="ui-icon-btn">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>
        <form id={formId} className="px-5 sm:px-6 pt-5 flex-1 min-h-0 overflow-y-auto" onSubmit={onSubmit} noValidate>
          {children}
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function SectionCard({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 mb-5">
      <h4 className="section-title">
        <i className={`fas ${icon}`} aria-hidden="true" /> {title}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

const RO_CLASS = 'ui-input';

/** Campo de solo lectura (valores del servidor como texto: sin interpolación HTML, corrige X-3). */
export function ReadonlyField({ label, value, type = 'text', name, className = '' }: {
  label: string; value: string | number; type?: 'text' | 'date' | 'number'; name?: string; className?: string;
}) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="ui-label">{label}</label>
      <input id={id} type={type} name={name} value={value} readOnly className={RO_CLASS} />
    </div>
  );
}

/** Botonera Cancelar / Guardar (con guardia de doble envío). */
export function EditModalActions({ onCancel, canSubmit, pending, icon, label }: {
  onCancel: () => void; canSubmit: boolean; pending: boolean; icon: string; label: string;
}) {
  const disabled = !canSubmit || pending;
  return (
    <div className="sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
      <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary">
        <i className="fas fa-times" aria-hidden="true" />Cancelar
      </button>
      <button type="submit" disabled={disabled} data-testid="edit-modal-submit"
        className={`ui-btn ui-btn-primary ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <i className={`fas ${pending ? 'fa-spinner fa-spin' : icon}`} aria-hidden="true" />{label}
      </button>
    </div>
  );
}
