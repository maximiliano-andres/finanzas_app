import type { FilterOptions, ReportFilters } from './reportLogic';
import { getMonthName } from './reportLogic';

export interface CardTheme { iconBg: string; icon: string; ring: string; button: string; buttonIcon: string }

const SELECT = 'ui-input w-full';

/** Select de filtro (populateSelect): "Todos" + opciones; sin valores → "No hay valor para filtrar" deshabilitado. */
function FilterSelect({ id, label, values, value, onChange, ring, isMonth = false }: {
  id: string; label: string; values: string[]; value: string; onChange: (v: string) => void; ring: string; isMonth?: boolean;
}) {
  // Si la selección ya no existe en las opciones, se vuelve a "Todos" (como al repoblar en el original).
  const effective = values.includes(value) ? value : '';
  return (
    <div>
      <label htmlFor={id} className="ui-label">{label}</label>
      <select id={id} value={effective} onChange={(e) => onChange(e.target.value)} className={`${SELECT} ${ring}`}>
        {values.length === 0 ? (
          <option value="" disabled>No hay valor para filtrar</option>
        ) : (
          <>
            <option value="">Todos</option>
            {values.map((v) => <option key={v} value={v}>{isMonth ? getMonthName(v) : v}</option>)}
          </>
        )}
      </select>
    </div>
  );
}

export function ReportCard({ prefix, title, description, theme, options, filters, onFilters, buttonLabel, onExport, busy, testId }: {
  prefix: string; title: string; description: string; theme: CardTheme; options: FilterOptions; filters: ReportFilters;
  onFilters: (f: ReportFilters) => void; buttonLabel: string; onExport: () => void; busy: boolean; testId: string;
}) {
  const set = (k: keyof ReportFilters) => (v: string) => onFilters({ ...filters, [k]: v });
  return (
    <div className="ui-card p-5 flex flex-col h-full">
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${theme.iconBg}`}><i className={`fas ${theme.icon} text-sm`} aria-hidden="true" /></div>
          <h3 className="min-w-0 text-base font-semibold text-slate-900">{title}</h3>
        </div>
        <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
      </div>
      <div className="grid gap-4 mb-6 flex-grow content-start grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))]">
        <FilterSelect id={`${prefix}Year`} label="Año" values={options.years} value={filters.year} onChange={set('year')} ring={theme.ring} />
        <FilterSelect id={`${prefix}Month`} label="Mes" values={options.months} value={filters.month} onChange={set('month')} ring={theme.ring} isMonth />
        <FilterSelect id={`${prefix}Status`} label="Estado" values={options.statuses} value={filters.status} onChange={set('status')} ring={theme.ring} />
        <FilterSelect id={`${prefix}Company`} label="Empresa" values={options.companies} value={filters.company} onChange={set('company')} ring={theme.ring} />
      </div>
      <div className="mt-auto pt-5 border-t border-[var(--border)]">
        <button type="button" onClick={onExport} disabled={busy} data-testid={testId}
          className={`ui-btn ui-btn-primary w-full ${theme.button}`}>
          <i className={`fas ${busy ? 'fa-spinner fa-spin' : theme.buttonIcon}`} aria-hidden="true" />
          <span>{buttonLabel}</span>
        </button>
      </div>
    </div>
  );
}
