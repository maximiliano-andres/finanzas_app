import { formatCurrency, formatDate } from '@/lib/format';
import type { Solicitud } from '@/lib/solicitud';
import { usePdfViewer } from '@/components/pdf/PdfViewerProvider';
import { EstadoBadge, FolioCells, PdfChip, RowActions, RowBox, VerDetalleButton } from './WorkflowTable';
import { canDeleteAprobacion, type Level, type TipoSolicitud } from './workflowLogic';
import type { WorkflowUi } from './useWorkflowUi';
import type { usePdfActions } from './usePdfActions';

const td = 'px-4 py-3 whitespace-nowrap text-center';
const tdP = 'px-4 py-3 bg-purple-100/20 whitespace-nowrap text-center';

interface Props {
  s: Solicitud;
  level: Level;
  tipo: TipoSolicitud;
  cardId: string;
  ui: WorkflowUi;
  pdf: ReturnType<typeof usePdfActions>;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  pdfSelected: ReadonlySet<number>;
  onTogglePdf: (id: number) => void;
}

/** Workflow.renderAprobacionRow (W:398-650). */
export function AprobacionRow({ s, level, tipo, cardId, ui, pdf, selected, onToggle, pdfSelected, onTogglePdf }: Props) {
  const openPdf = usePdfViewer();
  const busy = ui.pending.has(s.id);
  const actions = (
    <RowActions s={s} busy={busy}
      onAprobar={() => ui.openAccion(s, 'aprobar')}
      onDevolver={() => ui.openAccion(s, 'devolver')}
      onEditar={() => ui.openEditar(s)}
      onEliminar={canDeleteAprobacion(s) ? () => void ui.eliminar(s) : undefined} />
  );
  const common = (
    <>
      <td className="px-4 py-3 text-center">
        <RowBox id={s.id} selected={selected} onToggle={onToggle} className={`checkbox-aprob-${cardId}`} label={`Seleccionar solicitud #${s.id}`} />
      </td>
      <td className={`${td} font-semibold text-slate-900`}>#{s.id}</td>
    </>
  );
  const mid = (
    <>
      <td className={td}>{actions}</td>
      <td className={td}><EstadoBadge estado={s.estado} /></td>
      <td className={td}><VerDetalleButton onClick={() => ui.openDetalle(s)} /></td>
      <td className={`${td} text-slate-800`}>{s.solicitanteNombre}</td>
    </>
  );

  if (tipo === 'Mis Solicitudes') {
    return (
      <tr>
        {common}
        {mid}
        <td className={`${tdP} border-l border-purple-100 text-slate-800`}>{formatDate(s.fechaProceso)}</td>
        <td className={`${tdP} text-slate-800 hide-on-tablet`}>{s.unidadDeNegocio || '-'}</td>
        <td className={`${tdP} text-slate-600 hide-on-tablet font-mono text-xs`}>{s.cuentaContable || '-'}</td>
        <td className={`${tdP} text-slate-500 hide-on-mobile text-xs`}>{s.auxiliar || '-'}</td>
        <td className={`${tdP} text-slate-800`}>{s.procesoNombre}</td>
        <td className="px-4 py-3 bg-purple-100/20 text-slate-900 font-semibold tabular-nums whitespace-nowrap border-r border-purple-100 text-right">{formatCurrency(s.monto)}</td>
        <td className={`${td} text-slate-500 hide-on-mobile`}>{s.mesProceso}</td>
        <td className={`${td} text-slate-500 hide-on-mobile`}>{s.anio}</td>
        <td className={`${td} text-slate-500 hide-on-mobile`}>{formatDate(s.fechaPago)}</td>
      </tr>
    );
  }

  const inputId = `pdf-reg-auth-${s.id}-${level}`;
  return (
    <tr>
      {common}
      {level === 2 && (
        <td className="px-4 py-3 text-center border-l border-red-100">
          <RowBox id={s.id} selected={pdfSelected} onToggle={onTogglePdf} className={`checkbox-pdf-auth-${cardId}`} label={`Seleccionar #${s.id} para subir PDF`} />
        </td>
      )}
      {mid}
      <td className="bg-blue-100/20 border-l border-blue-100/50 text-slate-800 hide-on-tablet whitespace-nowrap px-4 py-3 text-center">{formatDate(s.fechaPago)}</td>
      <td className="bg-blue-100/20 text-slate-800 font-medium whitespace-nowrap px-4 py-3 text-center">{s.glosa}</td>
      <FolioCells s={s} bordered />
      {level === 2 && (
        <td className="bg-red-50/30 border-l border-red-100/50 text-center whitespace-nowrap px-4 py-3 border-r border-red-100/50">
          {!s.pdf_registro_autorizacion ? (
            <>
              <label htmlFor={inputId} className="flex flex-col items-center cursor-pointer group">
                <div className="flex flex-col items-center text-red-500 opacity-70 group-hover:opacity-100 transition-opacity">
                  <i className="fas fa-file-upload text-base mb-1" aria-hidden="true" />
                  <span className="text-[0.6875rem] font-medium">Cargar</span>
                </div>
              </label>
              <input type="file" id={inputId} accept=".pdf" style={{ display: 'none' }} disabled={pdf.busy} data-testid={inputId}
                onChange={(e) => {
                  const input = e.currentTarget;
                  const file = input.files?.[0];
                  if (file) void pdf.registroSingle(s.id, file).finally(() => { input.value = ''; });
                }} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <PdfChip path={s.pdf_registro_autorizacion} color="red" busy={pdf.busy} deleteTitle="Eliminar PDF"
                onView={() => openPdf(s.pdf_registro_autorizacion!, 'PDF Registro Autorización')}
                onDelete={() => void pdf.registroDelete(s.id)} />
            </div>
          )}
        </td>
      )}
      <td className="px-4 py-3 text-slate-900 font-semibold tabular-nums hide-on-mobile whitespace-nowrap text-center">{formatCurrency(s.monto)}</td>
      <td className={`${td} text-slate-500 hide-on-mobile`}>{s.mesProceso}</td>
      <td className={`${td} text-slate-500 hide-on-mobile`}>{s.anio}</td>
    </tr>
  );
}
