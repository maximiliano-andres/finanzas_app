/** Piezas de UI compartidas por los listados (markup y clases del original). */
import type { CSSProperties, ReactNode } from 'react';
import { formatCurrency, formatDate } from '@/lib/format';
import type { FolioSubRow } from '@/lib/solicitud';
import type { PeriodoFiltro } from './listUtils';

export type SubCellKey = 'fechaEmision' | 'obra' | 'folio' | 'monto' | 'pago';

function subCellText(row: FolioSubRow, k: SubCellKey): string {
  switch (k) {
    case 'fechaEmision': return formatDate(row.fechaEmision);
    case 'obra': return row.obra || '-';
    case 'folio': return row.folio || '-';
    case 'monto': return typeof row.monto === 'number' ? formatCurrency(row.monto) : (row.monto || '-');
    case 'pago': return row.formaDePago || '-';
  }
}

/** renderSubCell (utils.js:228-244): un <div> por folio. */
export function SubCell({ rows, k }: { rows: FolioSubRow[]; k: SubCellKey }) {
  return (
    <>
      {rows.map((row, i) => (
        <div key={i} className={`py-2 px-4 ${i < rows.length - 1 ? 'border-b border-slate-200/70' : ''} min-h-[2.5rem] flex items-center justify-center`}>
          {subCellText(row, k)}
        </div>
      ))}
    </>
  );
}

/** Botón acordeón (toggleTableAccordion, utils.js:250-268). */
export function AccordionToggle({ id, collapsed, onToggle }: { id: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button type="button" id={`btn-toggle-${id}`} onClick={onToggle} className={`table-header-toggle ${collapsed ? 'collapsed' : ''}`}
      title="Contraer/Expandir" aria-label="Contraer/Expandir" aria-expanded={!collapsed} aria-controls={`wrapper-${id}`}>
      <i className="fas fa-chevron-up" aria-hidden="true" />
    </button>
  );
}

export function AccordionBody({ id, collapsed, children }: { id: string; collapsed: boolean; children: ReactNode }) {
  return (
    <div className={`table-accordion-wrapper ${collapsed ? 'collapsed' : ''}`} id={`wrapper-${id}`}>
      <div className="table-accordion-content">
        <div className="table-responsive-container">{children}</div>
      </div>
    </div>
  );
}

/** Selects Año / Mes / F. Pago de las cabeceras con gradiente. */
export function PeriodoFilters({ idPrefix, idSuffix, value, onChange, options }: {
  idPrefix: string; idSuffix: string; value: PeriodoFiltro; onChange: (v: PeriodoFiltro) => void;
  options: { anios: number[]; meses: string[]; pagos: string[] };
}) {
  const sel = (key: keyof PeriodoFiltro, label: string, idKey: string, opts: Array<string | number>) => {
    const id = `${idPrefix}-${idKey}-${idSuffix}`;
    return (
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-500">{label}</label>
        <select id={id} className="filter-select" value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })}>
          <option value="todos">Todos</option>
          {opts.map((o) => <option key={o} value={String(o)}>{o}</option>)}
        </select>
      </div>
    );
  };
  return (
    <>
      {sel('anio', 'Año', 'year', options.anios)}
      {sel('mes', 'Mes', 'month', options.meses)}
      {sel('pago', 'F. Pago', 'pago', options.pagos)}
    </>
  );
}

/** Antes: estilo inline blanco para cabeceras con gradiente. Las cabeceras ahora son claras → se usa el estilo del sistema (.manual-help-btn-table). */
export const HELP_ON_GRADIENT: CSSProperties = {};

/** Cabeceras de tabla: neutra · grupo RRHH (tinte navy) · grupo Finanzas (tinte azul informativo). */
export const TH = 'px-4 py-3 whitespace-nowrap';
export const TH_RRHH = 'px-4 py-3 bg-purple-100 whitespace-nowrap text-purple-800';
export const TH_FIN = 'px-4 py-3 bg-blue-100 whitespace-nowrap text-blue-800';
