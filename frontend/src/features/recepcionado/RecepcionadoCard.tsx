/** Tarjeta "Recepción de {empresa}" (app.js:722-860) con filtros, estado, total y paginación. */
import { useMemo, useState } from 'react';
import { HelpButton } from '@/components/manual/ManualProvider';
import { useToast } from '@/components/feedback/ToastProvider';
import { Pagination, paginate } from '@/components/ui/Pagination';
import { formatCurrency, slugify } from '@/lib/format';
import type { Recepcionado } from '@/lib/solicitud';
import { AccordionBody, AccordionToggle, HELP_ON_GRADIENT, PeriodoFilters } from '@/features/solicitud-detalle/listParts';
import { periodoOptions, PERIODO_TODOS, sumMonto, type PeriodoFiltro } from '@/features/solicitud-detalle/listUtils';
import { filtrarRecepcionado, hayEditables, toggleEstado, type EstadoChecks } from './recepcionadoLogic';
import { RecepcionadoTable } from './RecepcionadoTable';

interface Props {
  empresa: string;
  rows: Recepcionado[];
  onOpen: (id: number) => void;
  onModificar: (r: Recepcionado) => void;
}

export function RecepcionadoCard({ empresa, rows, onOpen, onModificar }: Props) {
  const notify = useToast();
  const slug = slugify(empresa);
  const [periodo, setPeriodo] = useState<PeriodoFiltro>(PERIODO_TODOS);
  const [estados, setEstados] = useState<EstadoChecks>({ recepcionado: true, pagado: true });
  const [page, setPage] = useState(1);
  const [collapsed, setCollapsed] = useState(false);

  const options = useMemo(() => periodoOptions(rows), [rows]);
  const filtered = useMemo(() => filtrarRecepcionado(rows, { ...periodo, estados }), [rows, periodo, estados]);
  const { pageRows, totalPages, current } = paginate(filtered, page);
  // Cambio vs legacy (bug #12): "Monto Total" suma todos los registros filtrados (antes solo la página actual).
  const total = sumMonto(filtered);

  const onEstado = (key: keyof EstadoChecks, checked: boolean) => {
    const next = toggleEstado(estados, key, checked);
    if (!next) {
      notify('Debe haber al menos un estado seleccionado', 'warning');
      return;
    }
    setEstados(next);
    setPage(1);
  };

  const chk = (key: keyof EstadoChecks, label: string, value: string) => {
    const id = `filter-recepcionado-estado-${key}-${slug}`;
    return (
      <label htmlFor={id} className="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" id={id} value={value} checked={estados[key]} onChange={(e) => onEstado(key, e.target.checked)}
          className="rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary" />
        <span className="text-xs text-slate-700">{label}</span>
      </label>
    );
  };

  return (
    <div className="ui-card" id={`card-recepcionado-${slug}`} data-testid={`card-recepcionado-${slug}`}>
      <div className="ui-card-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="ui-card-title"><i className="fas fa-building" aria-hidden="true" />Recepción de {empresa}</h3>
          <HelpButton sectionId="recepcionados-columns" variant="table" style={HELP_ON_GRADIENT} />
          <AccordionToggle id={`recep-${slug}`} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodoFilters idPrefix="filter-recepcionado" idSuffix={slug} value={periodo} options={options}
            onChange={(p) => { setPeriodo(p); setPage(1); }} />
          <div className="flex items-center gap-3 rounded-lg px-3 py-1.5 border border-[var(--border)] bg-[var(--bg-secondary)]" role="group" aria-label="Estado">
            <span className="text-xs font-medium text-slate-500">Estado:</span>
            {chk('recepcionado', 'Recepcionado', 'RECEPCIONADO')}
            {chk('pagado', 'Pagado', 'PAGADO')}
          </div>
        </div>
      </div>

      <AccordionBody id={`recep-${slug}`} collapsed={collapsed}>
        <RecepcionadoTable tableId={`recepcionado-${slug}`} slug={slug} rows={pageRows} showModificar={hayEditables(rows)}
          onOpen={onOpen} onModificar={onModificar} />
      </AccordionBody>

      <div className="ui-card-footer flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-500">Monto Total: </span>
          <span className="text-lg font-semibold text-slate-900 tabular-nums" id={`total-recepcionado-${slug}`}>{formatCurrency(total)}</span>
        </div>
        <Pagination id={`pagination-recepcionado-${slug}`} page={current} totalPages={totalPages} total={filtered.length} onChange={setPage} />
      </div>
    </div>
  );
}
