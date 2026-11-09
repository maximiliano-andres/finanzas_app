import { useMemo, useRef, useState } from 'react';
import { qk, useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';
import { formatCurrency, slugify } from '@/lib/format';
import type { Solicitud } from '@/lib/solicitud';
import { AprobacionRow } from './AprobacionRow';
import { EmptyRow, FooterButton, SelectAllBox, toggleIn, WorkflowCard } from './WorkflowTable';
import { patchTransition, runSequential } from './workflowApi';
import {
  applyFilters, buildMassApprove, EMPTY_FILTERS, filterOptions, missingRegistroAutorizacionIds, missingRegistroAutorizacionText,
  sumMontos, type GroupFilters, type Level, type WorkflowGroup,
} from './workflowLogic';
import type { WorkflowUi } from './useWorkflowUi';
import type { usePdfActions } from './usePdfActions';

const TH = 'px-4 py-3 whitespace-nowrap';
const THP = 'px-4 py-3 bg-purple-100 whitespace-nowrap text-purple-800';
const THB = 'px-4 py-3 bg-blue-100 whitespace-nowrap text-blue-800';

interface Props { group: WorkflowGroup<Solicitud>; level: Level; ui: WorkflowUi; pdf: ReturnType<typeof usePdfActions> }

/** Una tarjeta empresa × tipo de Workflow.loadAprobacionesGeneric (W:42-301). */
export function AprobacionGroup({ group, level, ui, pdf }: Props) {
  const { empresa, tipo, rows } = group;
  const cardId = `${slugify(empresa)}-${tipo === 'Mis Solicitudes' ? 'solicitudes' : 'recepcionado'}${level === 2 ? '-2' : ''}`;
  const [filters, setFilters] = useState<GroupFilters>(EMPTY_FILTERS);
  const [sel, setSel] = useState<ReadonlySet<number>>(new Set());
  const [pdfSel, setPdfSel] = useState<ReadonlySet<number>>(new Set());
  const [massBusy, setMassBusy] = useState(false);
  const massRef = useRef(false);
  const notify = useToast();
  const dialog = useDialog();
  const invalidate = useInvalidate();

  const options = useMemo(() => filterOptions(rows), [rows]);
  const visible = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const visibleIds = visible.map((s) => s.id);
  const selectedRows = visible.filter((s) => sel.has(s.id));
  const pdfIds = visibleIds.filter((id) => pdfSel.has(id));
  const isRecep = tipo === 'Recepcionado';
  const showPdf = level === 2 && isRecep;

  const onFilters = (f: GroupFilters) => {
    setFilters(f);
    setSel(new Set());
    setPdfSel(new Set());
  };

  /** Workflow.aprobarMultiples (W:695-791). Cambio vs legacy: PATCH secuenciales sin refetch por ítem; una sola invalidación al final; botón bloqueado durante el proceso. */
  const aprobarMultiples = async () => {
    if (massRef.current || selectedRows.length < 1) return;
    const missing = missingRegistroAutorizacionIds(selectedRows, level);
    if (missing.length) return dialog.error('Documentación Requerida', missingRegistroAutorizacionText(missing));
    const target = selectedRows;
    if (!(await dialog.confirm('Aprobar Múltiples Solicitudes', `¿Está seguro de aprobar las ${target.length} solicitudes seleccionadas?`))) return;
    massRef.current = true;
    setMassBusy(true);
    try {
      notify('Procesando aprobaciones masivas...', 'info');
      const r = await runSequential(target, async (s) => {
        await patchTransition(s.id, buildMassApprove(s, level));
        return 'ok';
      });
      if (r.ok > 0) notify(`${r.ok} solicitudes aprobadas correctamente`, 'success');
      if (r.failed > 0) notify(`Hubo errores en ${r.failed} solicitudes${r.errors[0] ? `: ${r.errors[0]}` : ''}`, 'error');
      setSel(new Set());
      await invalidate(qk.solicitudes, qk.historico);
    } finally {
      massRef.current = false;
      setMassBusy(false);
    }
  };

  const selectAll = <th scope="col" className="px-4 py-3 text-left">
    <SelectAllBox id={`select-all-aprob-${cardId}`} ids={visibleIds} selected={sel} onChange={setSel} label="Seleccionar todas" />
  </th>;
  const head = tipo === 'Mis Solicitudes' ? (
    <>
      {selectAll}
      <th scope="col" className={TH}>ID</th>
      <th scope="col" className="px-4 py-3 text-left">Acciones</th>
      <th scope="col" className={TH}>Estado</th>
      <th scope="col" className={`${TH} text-center`}>Ver Detalles</th>
      <th scope="col" className={TH}>Solicitante</th>
      <th scope="col" className={`${THP} border-l border-purple-100`}>F. Proceso</th>
      <th scope="col" className={`${THP} hide-on-mobile`}>UNE</th>
      <th scope="col" className={`${THP} hide-on-mobile`}>Cuenta Objeto Código</th>
      <th scope="col" className={`${THP} hide-on-mobile`}>Auxiliar</th>
      <th scope="col" className={THP}>Proceso</th>
      <th scope="col" className={`${THP} border-r border-purple-100`}>Monto Total</th>
      <th scope="col" className={`${TH} hide-on-mobile`}>Mes</th>
      <th scope="col" className={`${TH} hide-on-mobile`}>Año</th>
      <th scope="col" className={`${TH} hide-on-mobile`}>Fecha de Pago</th>
    </>
  ) : (
    <>
      {selectAll}
      <th scope="col" className={TH}>ID</th>
      {showPdf && (
        <th scope="col" className="px-4 py-3 text-center border-l border-red-100">
          <div className="text-[0.6875rem] mb-1 text-red-800">Subir PDF</div>
          <SelectAllBox id={`select-all-pdf-auth-${cardId}`} ids={visibleIds} selected={pdfSel} onChange={setPdfSel} label="Seleccionar todas para subir PDF" />
        </th>
      )}
      <th scope="col" className="px-4 py-3 text-left">Acciones</th>
      <th scope="col" className={TH}>Estado</th>
      <th scope="col" className={`${TH} text-center`}>Ver Detalles</th>
      <th scope="col" className={TH}>Solicitante</th>
      <th scope="col" className={`${THB} border-l border-blue-100/50`}>Fecha de Pago</th>
      <th scope="col" className={`${THB} hide-on-mobile`}>Detalle</th>
      <th scope="col" className={`${THB} hide-on-mobile`}>Obra</th>
      <th scope="col" className={THB}>Giro Solicitado</th>
      <th scope="col" className={`${THB} hide-on-mobile`}>Folio</th>
      <th scope="col" className={`${THB} border-r border-blue-100/50`}>Forma de Pago</th>
      {level === 2 && <th scope="col" className="px-4 py-3 bg-red-100 whitespace-nowrap text-red-800 border-l border-red-100">PDF Registro Autorización</th>}
      <th scope="col" className={`${TH} hide-on-mobile`}>Monto Total</th>
      <th scope="col" className={`${TH} hide-on-mobile`}>Mes</th>
      <th scope="col" className={`${TH} hide-on-mobile`}>Año</th>
    </>
  );

  const footer = (
    <>
      <div className="action-bar">
        <div className="flex flex-col shrink-0">
          <span className="text-xs font-medium text-slate-500 mb-0.5">Monto Total Seleccionado:</span>
          <span className="text-xl font-semibold text-slate-900 tabular-nums" id={`total-aprob-${cardId}`}>{formatCurrency(sumMontos(selectedRows))}</span>
        </div>
        <FooterButton id={`btn-multi-aprob-${cardId}`} onClick={() => void aprobarMultiples()} disabled={selectedRows.length < 1 || massBusy}
          className="ui-btn ui-btn-primary">
          <i className={`fas ${massBusy ? 'fa-spinner fa-spin' : 'fa-check'}`} aria-hidden="true" />Aprobar Múltiples solicitudes {level === 2 ? 'Nº2' : ''}
        </FooterButton>
      </div>
      {showPdf && (
        <div className="action-bar">
          <FooterButton id={`btn-upload-pdf-auth-mass-${cardId}`} onClick={() => void pdf.registroMass(pdfIds)} disabled={pdfIds.length === 0 || pdf.busy}
            className="ui-btn ui-btn-danger-outline">
            <i className="fas fa-file-upload" aria-hidden="true" />
            Subir PDF Registro Autorización (Masivo)
          </FooterButton>
        </div>
      )}
    </>
  );

  return (
    <WorkflowCard prefix="aprob" cardId={cardId}
      title={<>{tipo === 'Mis Solicitudes' ? `Solicitudes de ${empresa}` : `Recepcionado de ${empresa}`} {level === 2 ? 'Nº2' : ''}</>}
      badge={`${visible.length} pendiente(s)`} badgeId={`badge-count-${cardId}`} helpSectionId="aprobaciones-columns"
      filters={filters} options={options} onFilters={onFilters} tableClassName="w-full text-sm"
      head={head}
      body={visible.length ? visible.map((s) => (
        <AprobacionRow key={s.id} s={s} level={level} tipo={tipo} cardId={cardId} ui={ui} pdf={pdf}
          selected={sel} onToggle={(id) => setSel((p) => toggleIn(p, id))}
          pdfSelected={pdfSel} onTogglePdf={(id) => setPdfSel((p) => toggleIn(p, id))} />
      )) : <EmptyRow text="No hay solicitudes pendientes para este periodo" />}
      footer={footer}
      footerClassName="ui-card-footer workflow-footer" />
  );
}
