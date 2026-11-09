/** Piezas de presentación del formulario #formSolicitud (dashboard.html:302-642). */
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { HelpButton } from '@/components/manual/ManualProvider';

export function FormBlock({ icon, title, helpId, children, bodyClass = 'p-4 sm:p-6 mobile-p-4' }: {
  icon: string; title: string; helpId: string; children: ReactNode; bodyClass?: string;
}) {
  return (
    <div className="ui-card">
      <div className="ui-card-header">
        <h3 className="form-group-title section-title !mb-0"><i className={`fas ${icon}`} aria-hidden="true" />{title}</h3>
        <HelpButton sectionId={helpId} variant="form" />
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

/** Mensaje bajo el campo (Validation.showFieldError → `<div id="error-${fieldId}">`). */
export function FieldError({ fieldId, msg }: { fieldId: string; msg?: string }) {
  if (!msg) return null;
  return (
    <div id={`error-${fieldId}`} role="alert" className="text-xs text-[var(--danger)] mt-1 flex items-center gap-1 animate-fadeIn">
      <i className="fas fa-exclamation-circle" aria-hidden="true" /><span>{msg}</span>
    </div>
  );
}

const LABEL = 'ui-label';
export const fieldClass = (base: 'form-select' | 'form-input', error: boolean, serverError = false) =>
  `${base} ui-input ${error ? '!border-red-500 ring-2 ring-red-500/15' : ''} ${serverError ? 'field-error' : ''}`;

export function LabeledField({ id, label, required = true, children, error }: {
  id: string; label: string; required?: boolean; children: ReactNode; error?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>{label}{required && <> <span className="text-[var(--danger)]">*</span></>}</label>
      {children}
      <FieldError fieldId={id} msg={error} />
    </div>
  );
}

/** Select de catálogo con los textos de carga/error del original (F:65-132). */
export function CatalogSelect<T extends { id: number }>({ id, value, onChange, query, loadingText, errorText, optionLabel, className }: {
  id: string; value: string; onChange: (v: string) => void; query: UseQueryResult<T[]>;
  loadingText: string; errorText: string; optionLabel: (x: T) => string; className: string;
}) {
  const placeholder = query.isLoading ? loadingText : query.isError && !query.data ? errorText : 'Seleccione...';
  return (
    <select id={id} required value={value} onChange={(e) => onChange(e.target.value)} disabled={query.isLoading} className={className}
      aria-invalid={className.includes('red-500') || undefined}>
      <option value="">{placeholder}</option>
      {(query.data ?? []).map((x) => <option key={x.id} value={String(x.id)}>{optionLabel(x)}</option>)}
    </select>
  );
}

export function TechBadge({ id, label, value, wide }: { id: string; label: string; value: string; wide?: boolean }) {
  return (
    <div className="tech-badge">
      <label htmlFor={id} className="tech-label">{label}</label>
      <input type="text" id={id} readOnly value={value} placeholder={wide ? 'Auto-generada' : 'Auto-generado'}
        className={`bg-transparent border-none p-0 w-full min-w-0 ${wide ? 'font-medium' : ''} focus:ring-0 focus:outline-none tech-value`} />
    </div>
  );
}
