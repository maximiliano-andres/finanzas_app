import { useMemo, useState } from 'react';
import { formatCurrency, slugify } from '@/lib/format';
import type { Solicitud } from '@/lib/solicitud';
import { EmptyRow, FooterButton, SelectAllBox, toggleIn, WorkflowCard } from '@/features/aprobaciones/WorkflowTable';
import type { WorkflowUi } from '@/features/aprobaciones/useWorkflowUi';
import type { usePdfActions } from '@/features/aprobaciones/usePdfActions';
import { applyFilters, EMPTY_FILTERS, filterOptions, sumMontos, type GroupFilters, type WorkflowGroup } from '@/features/aprobaciones/workflowLogic';
import { isAprobadoFinanzas, isFinanzasRestricted } from './finanzasLogic';
import { FinanzasRow } from './FinanzasRow';
import type { useFinanzasMass } from './useFinanzasMass';

const TH = 'px-4 py-3 hide-on-mobile whitespace-nowrap';
const THP = 'px-4 py-3 bg-purple-100 whitespace-nowrap text-purple-800';
const THB = 'px-4 py-3 bg-blue-100 whitespace-nowrap text-blue-800';

interface Props {
  group: WorkflowGroup<Solicitud>;
  ui: WorkflowUi;
  pdf: ReturnType<typeof usePdfActions>;
  mass: ReturnType<typeof useFinanzasMass>;
}

/** Una tarjeta empresa × tipo de Workflow.loadFinanzas (W:1044-1309). */
export function FinanzasGroup({ group, ui, pdf, mass }: Props) {
  const { empresa, tipo, rows } = group;
  const isRecep = tipo === 'Recepcionado';
  const cardId = `${slugify(empresa)}-${isRecep ? 'recepcionado' : 'solicitudes'}-finanzas`;
  const [filters, setFilters] = useState<GroupFilters>(EMPTY_FILTERS);
  const [sel, setSel] = useState<ReadonlySet<number>>(new Set());
  const [pdfSel, setPdfSel] = useState<ReadonlySet<number>>(new Set());

  const options = useMemo(() => filterOptions(rows), [rows]);
  const visible = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const selectableIds = visible.filter((s) => !isFinanzasRestricted(s, tipo)).map((s) => s.id);
  const selectedRows = visible.filter((s) => sel.has(s.id) && !isFinanzasRestricted(s, tipo));
  const pdfIds = visible.map((s) => s.id).filter((id) => pdfSel.has(id));
  const groupHasAF = rows.some(isAprobadoFinanzas);
  const visibleHasAF = visible.some(isAprobadoFinanzas);

  const onFilters = (f: GroupFilters) => {
    setFilters(f);
    setSel(new Set());
    setPdfSel(new Set());
  };

  const head = (
    <>
      <th scope="col" className="px-4 py-3 text-center">
        <div className="text-[0.6875rem] mb-1">Seleccionar para aprobar</div>
        <SelectAllBox id={`select-all-aprob-finanzas-${cardId}`} ids={selectableIds} selected={sel} onChange={setSel} label="Seleccionar todas para aprobar" />
      </th>
      {isRecep && (
        <th scope="col" className="px-4 py-3 text-center">
          <div className="text-[0.6875rem] mb-1">Subir PDF</div>
          <SelectAllBox id={`select-all-finanzas-${cardId}`} ids={visible.map((s) => s.id)} selected={pdfSel} onChange={setPdfSel} label="Seleccionar todas para subir PDF" />
        </th>
      )}
      <th scope="col" className="px-4 py-3 whitespace-nowrap">ID</th>
      <th scope="col" className="px-4 py-3 text-left">Acciones</th>
      <th scope="col" className="px-4 py-3 whitespace-nowrap">Estado</th>
      <th scope="col" className="px-4 py-3 text-center whitespace-nowrap">Ver Detalles</th>
      <th scope="col" className="px-4 py-3 whitespace-nowrap">Solicitante</th>
      {!isRecep ? (
        <>
          <th scope="col" className={THP}>F. Proceso</th>
          <th scope="col" className={`${THP} hide-on-mobile`}>UNE</th>
          <th scope="col" className={`${THP} hide-on-mobile`}>Cuenta</th>
          <th scope="col" className={`${THP} hide-on-mobile`}>Auxiliar</th>
          <th scope="col" className={THP}>Nombre del Proceso</th>
          <th scope="col" className={THP}>Monto</th>
          <th scope="col" className={TH}>Mes</th>
          <th scope="col" className={TH}>Año</th>
          <th scope="col" className={TH}>Fecha de Pago</th>
        </>
      ) : (
        <>
          <th scope="col" className={`${THB} hide-on-mobile`}>F. Pago</th>
          <th scope="col" className={`${THB} hide-on-mobile`}>Detalle</th>
          <th scope="col" className={`${THB} hide-on-mobile`}>Obra</th>
          <th scope="col" className={THB}>Giro Solicitado</th>
          <th scope="col" className={THB}>Folio</th>
          <th scope="col" className={`${THB} hide-on-mobile`}>Forma de Pago</th>
          <th scope="col" className={TH}>Monto Total</th>
          <th scope="col" className={TH}>PDF Firmado</th>
          <th scope="col" className={TH}>PDF Registro Autorización</th>
          <th scope="col" className={TH}>Mes</th>
          <th scope="col" className={TH}>Año</th>
        </>
      )}
    </>
  );

  const headerExtra = (
    <div className={`flex items-center gap-2 ml-1 border-l border-[var(--border)] pl-3 ${isRecep ? 'hidden' : ''}`}>
      <button type="button" data-testid={`btn-export-xlsx-${cardId}`} onClick={() => void mass.exportar(empresa)} disabled={!groupHasAF || mass.busy}
        title={groupHasAF ? 'Exportar a Excel (XLSX)' : 'No hay solicitudes aprobadas para exportar'}
        className={`ui-btn ui-btn-secondary ui-btn-sm ${groupHasAF ? '' : 'opacity-50 cursor-not-allowed pointer-events-none'}`}>
        <i className="fas fa-file-excel text-green-700" aria-hidden="true" />
        <span className="hidden sm:inline">Descargar XLSX</span>
      </button>
    </div>
  );

  const footer = (
    <>
      <div className="action-bar">
        <div className="flex flex-col shrink-0">
          <span className="text-xs font-medium text-slate-500 mb-0.5">Total para Procesar:</span>
          <span className="text-xl font-semibold text-slate-900 tabular-nums" id={`total-aprob-finanzas-${cardId}`}>{formatCurrency(sumMontos(selectedRows))}</span>
        </div>
        <FooterButton id={`btn-multi-aprob-finanzas-${cardId}`} disabled={selectedRows.length < 1 || mass.busy}
          onClick={() => void mass.procesarSeleccionadas(selectedRows).then(() => setSel(new Set()))}
          className="ui-btn ui-btn-primary">
          <i className={`fas ${mass.busy ? 'fa-spinner fa-spin' : 'fa-tasks'}`} aria-hidden="true" />Procesar Seleccionadas
        </FooterButton>
        <FooterButton id={`btn-solo-finanzas-${cardId}`} disabled={!visibleHasAF || mass.busy}
          title={visibleHasAF ? undefined : 'No hay solicitudes en estado Aprobado Finanzas para procesar'}
          onClick={() => void mass.procesarSoloFinanzas(empresa, tipo)}
          className={`ui-btn ui-btn-secondary ${visibleHasAF ? '' : 'pointer-events-none'}`}>
          <i className="fas fa-dollar-sign" aria-hidden="true" />Aprobación de finanzas
        </FooterButton>
      </div>
      {isRecep && (
        <div className="action-bar">
          <FooterButton id={`btn-upload-pdf-firmado-${cardId}`} disabled={pdfIds.length === 0 || pdf.busy}
            onClick={() => void pdf.firmadoMass(pdfIds)}
            className="ui-btn ui-btn-secondary">
            <i className="fas fa-file-signature" aria-hidden="true" />
            Subir PDF Firmados
          </FooterButton>
        </div>
      )}
    </>
  );

  return (
    <WorkflowCard prefix="finanzas" cardId={cardId} title={`Jefe de Finanzas de ${empresa} - ${tipo}`}
      badge={`${visible.length} solicitudes`} badgeId={`badge-count-finanzas-${cardId}`} helpSectionId="finanzas-columns"
      filters={filters} options={options} onFilters={onFilters} selectClassName="filter-select"
      headerExtra={headerExtra} head={head}
      body={visible.length ? visible.map((s) => (
        <FinanzasRow key={s.id} s={s} tipo={tipo} cardId={cardId} ui={ui} pdf={pdf}
          selected={sel} onToggle={(id) => setSel((p) => toggleIn(p, id))}
          pdfSelected={pdfSel} onTogglePdf={(id) => setPdfSel((p) => toggleIn(p, id))} />
      )) : <EmptyRow text="No hay solicitudes para este periodo" />}
      footer={footer}
      footerClassName="ui-card-footer workflow-footer" />
  );
}
