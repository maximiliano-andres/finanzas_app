/**
 * Piezas compartidas por las tablas de Aprobaciones (N1/N2) y Finanzas: en el original (W:42-301 vs W:1044-1309)
 * estaban duplicadas en ~80%. Mismo markup/clases que el HTML generado por workflow.js.
 */
import { useState, type ReactNode } from 'react';
import { HelpButton } from '@/components/manual/ManualProvider';
import { formatCurrency, getBadgeClass } from '@/lib/format';
import { getFolioSubRows, type FolioSubRow, type Solicitud } from '@/lib/solicitud';
import { truncateFilename, type GroupFilters } from './workflowLogic';

export interface FilterOptions { anios: string[]; meses: string[]; pagos: string[] }

interface CardProps {
  /** Prefijo + id de la tarjeta (ids legacy: wrapper-${prefix}-${cardId}, filter-year-${prefix}-${cardId}…). */
  prefix: 'aprob' | 'finanzas';
  cardId: string;
  title: ReactNode;
  badge: string;
  badgeId: string;
  helpSectionId: string;
  filters: GroupFilters;
  options: FilterOptions;
  onFilters: (f: GroupFilters) => void;
  selectClassName?: string;
  headerExtra?: ReactNode;
  head: ReactNode;
  body: ReactNode;
  footer: ReactNode;
  footerClassName: string;
  tableClassName?: string;
}

export function WorkflowCard(p: CardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const fid = (k: string) => `filter-${k}-${p.prefix}-${p.cardId}`;
  const select = (key: keyof GroupFilters, idKey: string, label: string, opts: string[]) => (
    <div className="flex items-center gap-2">
      <label htmlFor={fid(idKey)} className="text-xs font-medium text-slate-500">{label}:</label>
      <select id={fid(idKey)} className={p.selectClassName ?? 'filter-select'} value={opts.includes(p.filters[key]) ? p.filters[key] : 'todos'}
        onChange={(e) => p.onFilters({ ...p.filters, [key]: e.target.value })}>
        <option value="todos">Todos</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  return (
    <div className="ui-card overflow-hidden mb-8" id={`card-${p.prefix}-${p.cardId}`} data-testid={`card-${p.prefix}-${p.cardId}`}>
      <div className="ui-card-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="ui-card-title"><i className="fas fa-building" aria-hidden="true" />{p.title}</h3>
          <span className="ui-chip tabular-nums" id={p.badgeId}>{p.badge}</span>
          <HelpButton sectionId={p.helpSectionId} variant="table" />
          <button type="button" id={`btn-toggle-${p.prefix}-${p.cardId}`} onClick={() => setCollapsed((c) => !c)}
            className={`table-header-toggle ${collapsed ? 'collapsed' : ''}`} title="Contraer/Expandir" aria-label="Contraer/Expandir" aria-expanded={!collapsed}>
            <i className="fas fa-chevron-up" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {select('anio', 'year', 'Año', p.options.anios)}
          {select('mes', 'month', 'Mes', p.options.meses)}
          {select('pago', 'pago', 'F. Pago', p.options.pagos)}
          {p.headerExtra}
        </div>
      </div>
      <div className={`table-accordion-wrapper ${collapsed ? 'collapsed' : ''}`} id={`wrapper-${p.prefix}-${p.cardId}`}>
        <div className="table-accordion-content">
          <div className="table-responsive-container">
            <table className={p.tableClassName ?? 'w-full'}>
              <thead>
                <tr>{p.head}</tr>
              </thead>
              <tbody id={`tbody-${p.prefix}-${p.cardId}`}>{p.body}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div className={p.footerClassName}>{p.footer}</div>
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return <tr><td colSpan={15} className="px-4 py-10 text-center text-sm text-slate-500">{text}</td></tr>;
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="ui-card p-10 text-center text-sm text-slate-500">
      <i className={`fas ${icon} text-3xl mb-3`} aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

/** Checkbox de cabecera "seleccionar todo" (solo filas visibles). */
export function SelectAllBox({ id, ids, selected, onChange, label }: { id: string; ids: number[]; selected: ReadonlySet<number>; onChange: (s: Set<number>) => void; label: string }) {
  const all = ids.length > 0 && ids.every((i) => selected.has(i));
  return (
    <input type="checkbox" id={id} className="checkbox" aria-label={label} checked={all}
      onChange={(e) => onChange(e.target.checked ? new Set(ids) : new Set())} />
  );
}

export function RowBox({ id, selected, onToggle, className, label }: { id: number; selected: ReadonlySet<number>; onToggle: (id: number) => void; className: string; label: string }) {
  return <input type="checkbox" className={`checkbox ${className}`} value={id} aria-label={label} checked={selected.has(id)} onChange={() => onToggle(id)} />;
}

export function toggleIn(set: ReadonlySet<number>, id: number): Set<number> {
  const n = new Set(set);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

interface RowActionsProps {
  s: Solicitud;
  onAprobar: () => void;
  onDevolver: () => void;
  onEditar: () => void;
  onEliminar?: () => void;
  busy?: boolean;
  deleteIcon?: 'fa-trash-alt' | 'fa-trash';
}

/** Aprobar ✓ | Devolver ↶ (o Modificar y Reenviar ✎ si modificacion_solicitud) | Eliminar 🗑. */
export function RowActions({ s, onAprobar, onDevolver, onEditar, onEliminar, busy, deleteIcon = 'fa-trash-alt' }: RowActionsProps) {
  return (
    <div className="flex gap-1.5 justify-center">
      <button type="button" onClick={onAprobar} disabled={busy} data-testid={`btn-aprobar-${s.id}`} aria-label="Aprobar" title="Aprobar"
        className="ui-btn ui-btn-success ui-btn-sm">
        <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-check'}`} aria-hidden="true" />
      </button>
      {s.modificacion_solicitud === true ? (
        <button type="button" onClick={onEditar} data-testid={`btn-modificar-${s.id}`} aria-label="Modificar y Reenviar" title="Modificar y Reenviar"
          className="ui-btn ui-btn-secondary ui-btn-sm">
          <i className="fas fa-edit" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" onClick={onDevolver} disabled={busy} data-testid={`btn-devolver-${s.id}`} aria-label="Devolver" title="Devolver"
          className="ui-btn ui-btn-sm bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)] hover:brightness-95">
          <i className="fas fa-undo" aria-hidden="true" />
        </button>
      )}
      {onEliminar && (
        <button type="button" onClick={onEliminar} disabled={busy} data-testid={`btn-eliminar-${s.id}`} aria-label="Eliminar" title="Eliminar"
          className="ui-btn ui-btn-danger-outline ui-btn-sm">
          <i className={`fas ${deleteIcon}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: string }) {
  return <span className={getBadgeClass(estado)}>{estado}</span>;
}

export function VerDetalleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Ver Detalles" title="Ver Detalles" className="ui-icon-btn">
      <i className="fas fa-eye" aria-hidden="true" />
    </button>
  );
}

type SubKey = 'obra' | 'monto' | 'folio' | 'pago';
/** renderSubCell (utils.js:228-244). */
export function SubCell({ rows, k }: { rows: FolioSubRow[]; k: SubKey }) {
  return (
    <>
      {rows.map((r, i) => {
        let content: ReactNode;
        if (k === 'obra') content = r.obra || '-';
        else if (k === 'folio') content = r.folio || '-';
        else if (k === 'pago') content = r.formaDePago || '-';
        else content = typeof r.monto === 'number' ? formatCurrency(r.monto) : r.monto || '-';
        return (
          <div key={i} className={`py-2 px-4 ${i < rows.length - 1 ? 'border-b border-[var(--border)]' : ''} min-h-[2.5rem] flex items-center justify-center`}>{content}</div>
        );
      })}
    </>
  );
}

/** Celdas Obra | Giro Solicitado | Folio | Forma de Pago (tipo Recepcionado). */
export function FolioCells({ s, bordered }: { s: Solicitud; bordered: boolean }) {
  const rows = getFolioSubRows(s);
  const b = bordered ? ' border-r border-blue-100/50' : '';
  return (
    <>
      <td className={`bg-blue-100/20 text-slate-700 hide-on-tablet whitespace-nowrap px-4 py-3${b}`}><SubCell rows={rows} k="obra" /></td>
      <td className={`bg-blue-100/20 font-semibold text-slate-900 tabular-nums whitespace-nowrap px-4 py-3 text-right${b}`}><SubCell rows={rows} k="monto" /></td>
      <td className={`bg-blue-100/20 text-slate-800 font-medium whitespace-nowrap px-4 py-3 text-right${b}`}><SubCell rows={rows} k="folio" /></td>
      <td className={`bg-blue-100/20 text-slate-700 hide-on-mobile whitespace-nowrap text-sm px-4 py-3 text-right${b}`}><SubCell rows={rows} k="pago" /></td>
    </>
  );
}

/**
 * Píldora "SUBIDO" + nombre + 👁 + 🗑.
 * Cambio vs legacy: 👁 abre el visor autenticado (el original usaba <a href="/${path}">, roto sin cabecera de auth, B-30).
 */
export function PdfChip({ path, color, onView, onDelete, deleteTitle, busy }: {
  path: string; color: 'red' | 'green'; onView: () => void; onDelete?: () => void; deleteTitle: string; busy?: boolean;
}) {
  const { full, short } = truncateFilename(path);
  const c = color === 'red' ? { border: 'border-red-200', badge: 'bg-red-100 text-red-700' } : { border: 'border-green-200', badge: 'bg-green-100 text-green-700' };
  return (
    <div className="flex items-center justify-center">
      <div className={`inline-flex items-center bg-white border ${c.border} rounded-full px-2.5 py-1 gap-2`}>
        <span className={`${c.badge} text-[0.6875rem] font-semibold px-1.5 py-0.5 rounded`}>SUBIDO</span>
        <span className="text-[0.6875rem] font-medium text-slate-700 truncate max-w-[6.25rem] leading-tight" title={full}>{short}</span>
        <div className="flex items-center border-l border-[var(--border)] pl-2 gap-1">
          <button type="button" onClick={onView} aria-label={`Ver PDF: ${full}`} title={`Ver PDF: ${full}`}
            className="ui-icon-btn !w-7 !h-7 hover:!text-primary">
            <i className="fas fa-eye text-sm" aria-hidden="true" />
          </button>
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={busy} aria-label={deleteTitle} title={deleteTitle}
              className="ui-icon-btn !w-7 !h-7 hover:!text-red-600 hover:!bg-red-50">
              <i className="fas fa-trash-alt text-[0.6875rem]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Botón de pie con estado deshabilitado legacy (opacity-50 cursor-not-allowed). */
export function FooterButton({ id, onClick, disabled, className, children, title, testId }: {
  id: string; onClick: () => void; disabled: boolean; className: string; children: ReactNode; title?: string; testId?: string;
}) {
  return (
    <button type="button" id={id} data-testid={testId ?? id} onClick={onClick} disabled={disabled} title={title}
      className={`${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      {children}
    </button>
  );
}
