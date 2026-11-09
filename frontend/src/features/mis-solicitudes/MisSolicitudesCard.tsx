/** Tarjeta por empresa × tipo_solicitud (app.js:1215-1370) con filtros, selección, total y paginación. */
import { useMemo, useState } from 'react';
import { HelpButton } from '@/components/manual/ManualProvider';
import { Pagination, paginate } from '@/components/ui/Pagination';
import { formatCurrency } from '@/lib/format';
import { AccordionBody, AccordionToggle, PeriodoFilters } from '@/features/solicitud-detalle/listParts';
import { matchesPeriodo, periodoOptions, PERIODO_TODOS, sumMonto, type PeriodoFiltro } from '@/features/solicitud-detalle/listUtils';
import { puedeEnviar, type GrupoEmpresaTipo } from './misSolicitudesLogic';
import { MisSolicitudesTable } from './MisSolicitudesTable';

interface Props {
  grupo: GrupoEmpresaTipo;
  onOpen: (id: number) => void;
  enviar: (ids: number[]) => Promise<boolean>;
  sending: boolean;
}

export function MisSolicitudesCard({ grupo, onOpen, enviar, sending }: Props) {
  const { empresa, tipo, cardId, rows } = grupo;
  const [periodo, setPeriodo] = useState<PeriodoFiltro>(PERIODO_TODOS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [collapsed, setCollapsed] = useState(false);

  const options = useMemo(() => periodoOptions(rows), [rows]);
  const filtered = useMemo(() => rows.filter((s) => matchesPeriodo(s, periodo)), [rows, periodo]);
  const { pageRows, totalPages, current } = paginate(filtered, page);

  // Solo cuentan las filas seleccionadas que siguen visibles (tras recargar datos pueden haber desaparecido).
  const seleccionadas = filtered.filter((s) => selected.has(s.id));
  const total = sumMonto(seleccionadas);
  const habilitado = puedeEnviar(seleccionadas) && !sending;

  // Cambio vs legacy: al filtrar o cambiar de página se limpia la selección (antes el total quedaba desfasado).
  const changePeriodo = (p: PeriodoFiltro) => { setPeriodo(p); setPage(1); setSelected(new Set()); };
  const changePage = (p: number) => { setPage(p); setSelected(new Set()); };
  const toggle = (id: number) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(pageRows.map((r) => r.id)) : new Set());

  async function onEnviar() {
    if (await enviar(seleccionadas.map((s) => s.id))) setSelected(new Set());
  }

  return (
    <div className="ui-card" id={`card-${cardId}`} data-testid={`card-${cardId}`}>
      <div className="ui-card-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="ui-card-title">
            <i className="fas fa-building" aria-hidden="true" />
            {tipo === 'Mis Solicitudes' ? `Solicitudes de ${empresa}` : `Recepcionado de ${empresa}`}
          </h3>
          <HelpButton sectionId={tipo === 'Mis Solicitudes' ? 'solicitudes-columns' : 'recepcionado-columns'} variant="table" />
          <AccordionToggle id={cardId} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodoFilters idPrefix="filter" idSuffix={cardId} value={periodo} onChange={changePeriodo} options={options} />
        </div>
      </div>

      <AccordionBody id={cardId} collapsed={collapsed}>
        <MisSolicitudesTable tableId={`mis-solicitudes-${cardId}`} cardId={cardId} tipo={tipo} rows={pageRows}
          selected={selected} onToggle={toggle} onToggleAll={toggleAll} onOpen={onOpen} />
      </AccordionBody>

      <div className="ui-card-footer flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-500">Monto Total Seleccionado: </span>
          <span className="text-lg font-semibold text-slate-900 tabular-nums" id={`total-${cardId}`}>{formatCurrency(total)}</span>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Pagination id={`pagination-${cardId}`} page={current} totalPages={totalPages} total={filtered.length} onChange={changePage} />
          <button type="button" id={`btn-enviar-${cardId}`} data-testid={`btn-enviar-${cardId}`} onClick={onEnviar} disabled={!habilitado}
            className="ui-btn ui-btn-primary ui-btn-sm w-full sm:w-auto">
            <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
            Enviar a Aprobación
          </button>
        </div>
      </div>
    </div>
  );
}
