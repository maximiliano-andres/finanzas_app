import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** Cascarón común de los modales #adminModal (admin.js). Como el original, no se cierra con ESC ni clic en fondo. */
export function AdminModal({ icon, title, subtitle, children, footer, wide = false }: {
  icon: string; title: string; subtitle: string; children: ReactNode; footer: ReactNode; wide?: boolean;
}) {
  // Portal: el modal se monta en <body> para no quedar atrapado en el contexto de apilamiento de la sección.
  return createPortal(
    <div id="adminModal" className="fixed inset-0 z-[1000] bg-slate-950/55 backdrop-blur-[2px] flex items-center justify-center p-0 sm:p-4 animate-fadeIn">
      <div role="dialog" aria-modal="true" aria-labelledby="adminModalTitle"
        className={`bg-white w-full ${wide ? 'sm:max-w-xl' : 'sm:max-w-md'} max-h-[100dvh] sm:max-h-[90vh] sm:rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden`}>
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
              <i className={`fas ${icon}`} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="adminModalTitle" className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500">{subtitle}</p>
            </div>
          </div>
        </div>
        <div className="overflow-y-auto custom-scrollbar flex-1">{children}</div>
        <div className="px-5 sm:px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ModalFooter({ onCancel, onSave, saving, label = 'Guardar Cambios', icon = 'fa-save' }: {
  onCancel: () => void; onSave: () => void; saving: boolean; label?: string; icon?: string;
}) {
  return (
    <>
      <button type="button" onClick={onCancel} disabled={saving}
        className="ui-btn ui-btn-secondary">
        Cancelar
      </button>
      <button type="button" onClick={onSave} disabled={saving} data-testid="admin-modal-save"
        className="ui-btn ui-btn-primary">
        <i className={`fas ${saving ? 'fa-spinner fa-spin' : icon}`} aria-hidden="true" />{label}
      </button>
    </>
  );
}

const LABEL = 'ui-label';
const INPUT = 'form-input';

/** Campo de texto con etiqueta y marca .field-error (markFieldsWithErrors). */
export function TextField({ id, label, value, onChange, required = false, placeholder, prefixIcon, mono = false, type = 'text', errors, labelWeight = 'font-black' }: {
  id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string;
  prefixIcon?: string; mono?: boolean; type?: string; errors: Set<string>; labelWeight?: string;
}) {
  const hasErr = errors.has(id);
  const input = (
    <input type={type} id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      aria-invalid={hasErr || undefined}
      className={`${INPUT} ${prefixIcon ? '!pl-10' : ''} ${mono ? 'font-mono' : ''} ${hasErr ? 'field-error' : ''}`} />
  );
  return (
    <div>
      <label htmlFor={id} className={LABEL.replace('font-black', labelWeight)}>
        {label} {required && <span className="text-[var(--danger)]">*</span>}
      </label>
      {prefixIcon ? (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-sm">
            <i className={`fas ${prefixIcon}`} aria-hidden="true" />
          </div>
          {input}
        </div>
      ) : input}
    </div>
  );
}

export function EstadoField({ id, value, onChange, errors }: {
  id: string; value: string; onChange: (v: string) => void; errors: Set<string>;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>Estado de Disponibilidad <span className="text-[var(--danger)]">*</span></label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className={`form-select ${errors.has(id) ? 'field-error' : ''}`}>
        <option value="Activo">Habilitado (Activo)</option>
        <option value="Inactivo">Deshabilitado (Inactivo)</option>
      </select>
    </div>
  );
}
