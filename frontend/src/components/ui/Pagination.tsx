/** Paginación cliente de 50 filas (frontend_pagination.js), mismos textos y estilos. */
export const PAGE_SIZE = 50;

export function paginate<T>(rows: T[], page: number, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages); // clamp (el original no lo hacía → tabla vacía)
  return { pageRows: rows.slice((current - 1) * pageSize, current * pageSize), totalPages, current };
}

const BTN = 'ui-btn ui-btn-secondary ui-btn-sm';

export function Pagination({ page, totalPages, total, onChange, id }: { page: number; totalPages: number; total: number; onChange: (p: number) => void; id?: string }) {
  if (totalPages <= 1) {
    return (
      <div id={id} className="flex items-center justify-center gap-3">
        {total > 0 && <span className="text-xs text-slate-500 tabular-nums">{total} registro{total !== 1 ? 's' : ''}</span>}
      </div>
    );
  }
  return (
    <nav id={id} aria-label="Paginación" className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
      <button type="button" className={BTN} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <i className="fas fa-chevron-left text-[0.6875rem]" aria-hidden="true" /> Anterior
      </button>
      <span className="text-xs sm:text-sm text-slate-600 tabular-nums px-1" aria-live="polite">
        Página {page} de {totalPages} <span className="hidden sm:inline">({total} registros)</span>
      </span>
      <button type="button" className={BTN} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Siguiente <i className="fas fa-chevron-right text-[0.6875rem]" aria-hidden="true" />
      </button>
    </nav>
  );
}
