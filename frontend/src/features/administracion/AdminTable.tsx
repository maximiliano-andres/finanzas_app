import { useCallback, useState, type ReactNode } from 'react';
import { HelpButton } from '@/components/manual/ManualProvider';
import { LoadingRow } from '@/components/ui/Spinner';

/** Cabecera "Total: N …" + ayuda de columnas + botón "Nuevo …" (admin.js). */
export function TabHeader({ total, helpId, newLabel, newIcon = 'fa-plus', onNew, testId }: {
  total: string; helpId: string; newLabel: string; newIcon?: string; onNew: () => void; testId: string;
}) {
  return (
    <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-slate-800 tabular-nums">{total}</h3>
        <HelpButton sectionId={helpId} variant="table" />
      </div>
      <button type="button" onClick={onNew} className="ui-btn ui-btn-primary ui-btn-sm" data-testid={testId}>
        <i className={`fas ${newIcon}`} aria-hidden="true" />{newLabel}
      </button>
    </div>
  );
}

export function AdminTable({ id, columns, loading, error, empty, children }: {
  id: string; columns: string[]; loading: boolean; error?: string | null; empty: ReactNode | null; children: ReactNode;
}) {
  // Cambio vs legacy: colspan = número real de columnas (el original usaba valores incorrectos).
  const span = columns.length;
  return (
    <div className="table-responsive-container">
      <table className="w-full" id={id}>
        <thead>
          <tr>{columns.map((c) => <th key={c} scope="col" className="px-4 py-3 text-left">{c}</th>)}</tr>
        </thead>
        <tbody>
          {loading ? <LoadingRow colSpan={span} /> : error ? (
            <tr><td colSpan={span} className="px-4 py-10 text-center text-sm text-[var(--danger)]">{error}</td></tr>
          ) : empty ? (
            <tr><td colSpan={span} className="px-4 py-10 text-center text-sm text-slate-500">{empty}</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

export function RowActions({ onEdit, onDelete, deleteDisabled = false, deleteTitle = 'Eliminar', busy = false, label }: {
  onEdit: () => void; onDelete: () => void; deleteDisabled?: boolean; deleteTitle?: string; busy?: boolean; label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onEdit} title="Editar" aria-label={`Editar ${label}`}
        className="ui-icon-btn hover:!text-primary hover:!bg-primary-soft">
        <i className="fas fa-edit" aria-hidden="true" />
      </button>
      <button type="button" onClick={onDelete} title={deleteTitle} aria-label={`${deleteTitle} ${label}`}
        disabled={deleteDisabled || busy} data-testid="admin-delete"
        className={`ui-icon-btn hover:!text-red-600 hover:!bg-red-50 ${deleteDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-trash'}`} aria-hidden="true" />
      </button>
    </div>
  );
}

export function CreateLink({ text, onClick }: { text: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="font-medium text-primary hover:underline">{text}</button>;
}

/** Marcado de campos con error (.field-error) que se limpia al editar el campo. */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Set<string>>(() => new Set());
  const set = useCallback((ids: string[]) => setErrors(new Set(ids)), []);
  const clear = useCallback((id: string) => setErrors((s) => {
    if (!s.has(id)) return s;
    const n = new Set(s); n.delete(id); return n;
  }), []);
  return { errors, set, clear };
}
