import { formatCurrency, formatDate } from '@/lib/format';
import type { Solicitud } from '@/lib/solicitud';
import { usePdfViewer } from '@/components/pdf/PdfViewerProvider';
import { EstadoBadge, FolioCells, PdfChip, RowActions, RowBox, VerDetalleButton } from '@/features/aprobaciones/WorkflowTable';
import type { WorkflowUi } from '@/features/aprobaciones/useWorkflowUi';
import type { usePdfActions } from '@/features/aprobaciones/usePdfActions';
import type { TipoSolicitud } from '@/features/aprobaciones/workflowLogic';
import { finanzasApproveAction, finanzasRowMode, isFinanzasRestricted } from './finanzasLogic';

const td = 'px-4 py-3 text-center';
const tdP = 'px-4 py-3 bg-purple-100/20 whitespace-nowrap text-center';

interface Props {
  s: Solicitud;
  tipo: TipoSolicitud;
  cardId: string;
  ui: WorkflowUi;
  pdf: ReturnType<typeof usePdfActions>;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  pdfSelected: ReadonlySet<number>;
  onTogglePdf: (id: number) => void;
}

function Acciones({ s, tipo, ui }: { s: Solicitud; tipo: TipoSolicitud; ui: WorkflowUi }) {
  const mode = finanzasRowMode(s, tipo);
  if (mode === 'acciones') {
    return (
      <RowActions s={s} busy={ui.pending.has(s.id)} deleteIcon="fa-trash"
        onAprobar={() => {
          const a = finanzasApproveAction(s);
          if (a) void ui.aprobarDirecto(s, a.accion, a.comentario);
        }}
        onDevolver={() => ui.openAccion(s, 'devolver')}
        onEditar={() => ui.openEditar(s)}
        onEliminar={() => void ui.eliminar(s)} />
    );
  }
  if (mode === 'fase1' || mode === 'fase2') {
    const c = mode === 'fase1' ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]' : 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]';
    return (
      <div className="flex items-center justify-center">
        <span className={`inline-flex items-center gap-1.5 ${c} px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap`}>
          <i className="fas fa-check" aria-hidden="true" />{mode === 'fase1' ? 'Aprobado Fase 1' : 'Aprobado Fase 2'}
        </span>
      </div>
    );
  }
  return <span className="text-[var(--success)] text-sm font-medium inline-flex items-center gap-1.5"><i className="fas fa-check-circle" aria-hidden="true" />Completado</span>;
}

/** Workflow.renderFinanzasRow (W:793-1042). */
export function FinanzasRow({ s, tipo, cardId, ui, pdf, selected, onToggle, pdfSelected, onTogglePdf }: Props) {
  const openPdf = usePdfViewer();
  const isRecep = tipo === 'Recepcionado';
  return (
    <tr>
      <td className={td}>
        {isFinanzasRestricted(s, tipo) ? (
          <div className="flex items-center justify-center text-slate-400" title="Solicitud ya aprobada por Finanzas">
            <i className="fas fa-lock" aria-hidden="true" /><span className="sr-only">Solicitud ya aprobada por Finanzas</span>
          </div>
        ) : (
          <RowBox id={s.id} selected={selected} onToggle={onToggle} className={`checkbox-aprob-finanzas-${cardId}`} label={`Seleccionar solicitud #${s.id}`} />
        )}
      </td>
      {isRecep && (
        <td className={td}>
          <RowBox id={s.id} selected={pdfSelected} onToggle={onTogglePdf} className={`checkbox-finanzas-${cardId}`} label={`Seleccionar #${s.id} para subir PDF`} />
        </td>
      )}
      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap text-center">#{s.id}</td>
      <td className={td}><Acciones s={s} tipo={tipo} ui={ui} /></td>
      <td className="px-4 py-3 whitespace-nowrap text-center"><EstadoBadge estado={s.estado} /></td>
      <td className={td}><VerDetalleButton onClick={() => ui.openDetalle(s)} /></td>
      <td className="px-4 py-3 text-slate-800 whitespace-nowrap text-center">{s.solicitanteNombre}</td>
      {!isRecep ? (
        <>
          <td className={`${tdP} text-slate-800`}>{formatDate(s.fechaProceso)}</td>
          <td className={`${tdP} text-slate-800 hide-on-tablet`}>{s.unidadDeNegocio || '-'}</td>
          <td className={`${tdP} text-slate-600 hide-on-tablet font-mono text-xs`}>{s.cuentaContable || '-'}</td>
          <td className={`${tdP} text-slate-500 hide-on-mobile text-xs`}>{s.auxiliar || '-'}</td>
          <td className={`${tdP} text-slate-800`}>{s.glosa || s.procesoNombre}</td>
          <td className="px-4 py-3 bg-purple-100/20 text-slate-900 font-semibold tabular-nums whitespace-nowrap text-right">{formatCurrency(s.monto)}</td>
          <td className="px-4 py-3 text-slate-500 hide-on-mobile whitespace-nowrap text-center">{s.mesProceso}</td>
          <td className="px-4 py-3 text-slate-500 hide-on-mobile whitespace-nowrap text-center">{s.anio}</td>
          <td className="px-4 py-3 text-slate-500 hide-on-mobile whitespace-nowrap text-center">{formatDate(s.fechaPago)}</td>
        </>
      ) : (
        <>
          <td className="bg-blue-100/20 text-slate-800 hide-on-tablet whitespace-nowrap px-4 py-3 text-center">{formatDate(s.fechaPago)}</td>
          <td className="bg-blue-100/20 text-slate-800 font-medium whitespace-nowrap px-4 py-3 text-center">{s.glosa}</td>
          <FolioCells s={s} bordered={false} />
          <td className="px-4 py-3 text-slate-900 font-semibold tabular-nums hide-on-mobile whitespace-nowrap text-center">{formatCurrency(s.monto)}</td>
          <td className="text-center px-4 py-3 hide-on-mobile">
            {!s.pdf_firmado ? (
              <div className="flex flex-col items-center text-slate-400">
                <i className="fas fa-file-upload text-base mb-1" aria-hidden="true" />
                <span className="text-[0.6875rem] font-medium">Pendiente</span>
              </div>
            ) : (
              <PdfChip path={s.pdf_firmado} color="green" busy={pdf.busy} deleteTitle="Eliminar este archivo"
                onView={() => openPdf(s.pdf_firmado!, 'PDF Firmado')} onDelete={() => void pdf.firmadoDelete(s.id)} />
            )}
          </td>
          <td className="bg-red-50/20 text-center whitespace-nowrap px-4 py-3">
            {!s.pdf_registro_autorizacion ? (
              <span className="text-slate-400 text-xs">Sin PDF</span>
            ) : (
              <div className="flex items-center justify-center">
                {/* Cambio vs legacy: abre el visor autenticado en lugar de <a href="/${path}"> (B-30). */}
                <button type="button" onClick={() => openPdf(s.pdf_registro_autorizacion!, 'PDF Registro Autorización')}
                  title={`Ver PDF: ${s.pdf_registro_autorizacion.split('/').pop()}`} aria-label={`Ver PDF: ${s.pdf_registro_autorizacion.split('/').pop()}`}
                  className="inline-flex items-center bg-white border border-red-200 rounded-full px-2.5 py-1 gap-2 text-slate-500 hover:text-primary hover:bg-slate-50 transition-colors">
                  <span className="bg-red-100 text-red-700 text-[0.6875rem] font-semibold px-1.5 py-0.5 rounded">SUBIDO</span>
                  <i className="fas fa-eye text-xs" aria-hidden="true" />
                </button>
              </div>
            )}
          </td>
          <td className="px-4 py-3 text-slate-500 hide-on-mobile whitespace-nowrap text-center">{s.mesProceso}</td>
          <td className="px-4 py-3 text-slate-500 hide-on-mobile whitespace-nowrap text-center">{s.anio}</td>
        </>
      )}
    </tr>
  );
}
