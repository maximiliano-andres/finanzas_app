/** #previewModal "Voucher de Solicitud" (dashboard.html:1036-1245 + forms.js showPreview). */
import { createPortal } from 'react-dom';
import { BrandLockup } from '@/components/ui/BrandMark';
import { usePdfViewer } from '@/components/pdf/PdfViewerProvider';
import { formatCurrency, formatDate } from '@/lib/format';
import { cleanMonto, foliosParaEnvio, type NuevaSolicitudValues } from './logic';

export interface PreviewData {
  values: NuevaSolicitudValues;
  empresaNombre: string;
  obraNombre: string;
  procesoNombre: string;
  une: string;
  cuentaObjeto: string;
  cuentaAuxiliar: string;
  glosa: string;
  montoTotal: string;
}

function Row({ id, label, value, title, accent, block }: { id: string; label: string; value: string; title?: boolean; accent?: boolean; block?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${block ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs text-slate-500">{label}</span>
      <span id={id} className={accent ? 'text-sm font-semibold text-slate-900 break-words' : `text-sm font-semibold text-slate-900 ${title ? 'truncate' : ''}`} title={title ? value : undefined}>{value}</span>
    </div>
  );
}

export function PreviewModal({ data, submitting, onBack, onConfirm }: {
  data: PreviewData; submitting: boolean; onBack: () => void; onConfirm: () => void;
}) {
  const openPdf = usePdfViewer();
  const v = data.values;
  const folios = foliosParaEnvio(v.folios);
  // Portal: el modal se monta en <body> para no quedar atrapado en el contexto de apilamiento de la sección.
  return createPortal(
    <div id="previewModal" className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-[1000] flex items-center justify-center p-0 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="previewModalTitle" className="bg-white w-full sm:max-w-4xl max-h-[100dvh] sm:max-h-[90vh] sm:rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0"><i className="fas fa-file-invoice" aria-hidden="true" /></div>
            <div className="min-w-0">
              <h3 id="previewModalTitle" className="text-lg font-semibold text-slate-900">Previsualizar Solicitud</h3>
              <p className="text-sm text-slate-500">Revise los detalles antes de enviar</p>
            </div>
          </div>
          <button type="button" onClick={onBack} disabled={submitting} aria-label="Cerrar previsualización"
            className="ui-icon-btn">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 overflow-y-auto space-y-6 bg-[var(--bg-primary)]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[var(--border)] pb-5 gap-4">
            <div className="flex items-center gap-4">
              <BrandLockup size="lg" />
              <div className="h-10 w-px bg-[var(--border)] hidden md:block" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Voucher de Solicitud</h2>
                <p className="text-xs text-slate-500">Documento de Control Interno</p>
              </div>
            </div>
            <div className="md:text-right flex flex-col md:items-end">
              <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 flex flex-col md:items-end">
                <span className="text-xs text-slate-500">Número de Solicitud</span>
                {/* Igual que el original: el número aún no existe antes de crear la solicitud. */}
                <span id="previewFolio" className="text-lg font-semibold text-slate-900 tabular-nums">-</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
              <Row id="previewMes" label="Mes de Proceso" value={v.mesProceso} />
              <Row id="previewFechaProceso" label="Fecha Emisión" value={formatDate(v.fechaProceso)} />
              <Row id="previewFechaPago" label="Fecha Pago Estimada" value={formatDate(v.fechaPago)} />
              <Row id="previewGlosa" label="Glosa" value={data.glosa} accent block />
            </div>
            <div className="grid grid-cols-1 gap-4 content-start">
              <Row id="previewEmpresa" label="Empresa" value={data.empresaNombre} title />
              <Row id="previewObra" label="Unidad / Obra" value={data.obraNombre} title />
              <Row id="previewProceso" label="Proceso" value={data.procesoNombre} title />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-3">Unidad Negocio (UNE)</th>
                  <th scope="col" className="px-4 py-3">Cuenta Objeto</th>
                  <th scope="col" className="px-4 py-3">Auxiliar</th>
                  <th scope="col" className="px-4 py-3 text-right">Monto Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td id="previewUne" className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">{data.une}</td>
                  <td id="previewObjeto" className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">{data.cuentaObjeto}</td>
                  <td id="previewAuxiliar" className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">{data.cuentaAuxiliar}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span id="previewMonto" className="text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(cleanMonto(data.montoTotal))}</span>
                    <span className="text-xs text-slate-500 ml-1">CLP</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <i className="fas fa-list-ul text-slate-400 text-sm" aria-hidden="true" />
                <h4 className="text-sm font-semibold text-slate-900">Desglose de Folios y Pagos</h4>
              </div>
              <span className="ui-chip">Documentación por folio</span>
            </div>
            <div id="previewFoliosContainer" className="grid grid-cols-1 gap-3">
              {folios.length === 0 && <p className="text-sm text-slate-500">No hay folios registrados</p>}
              {folios.map((f, i) => (
                <div key={i} className="p-4 bg-white rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-3 flex flex-col min-w-0">
                    <span className="text-xs text-slate-500 mb-0.5">Folio</span>
                    <span className="text-sm font-semibold text-slate-900 font-mono inline-block max-w-full break-all whitespace-normal">#{f.folio || 'N/A'}</span>
                  </div>
                  <div className="md:col-span-2 flex flex-col min-w-0">
                    <span className="text-xs text-slate-500 mb-0.5">Monto</span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums block w-full truncate" title={`${formatCurrency(f.monto)} CLP`}>{formatCurrency(f.monto)} <span className="text-[0.6875rem] text-slate-500">CLP</span></span>
                  </div>
                  <div className="md:col-span-3 flex flex-col min-w-0">
                    <span className="text-xs text-slate-500 mb-0.5">Forma de Pago</span>
                    <span className="text-sm font-semibold text-slate-900 block w-full break-words whitespace-normal">{f.forma_pago || 'N/A'}</span>
                  </div>
                  <div className="md:col-span-4 flex flex-col min-w-0">
                    <span className="text-xs text-slate-500 mb-0.5">Documento del Folio</span>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200 group/file relative overflow-hidden">
                      <div className="w-8 h-8 rounded-md bg-red-50 flex items-center justify-center text-red-600 shrink-0"><i className="fas fa-file-pdf" aria-hidden="true" /></div>
                      <div className="flex-1 min-w-0 pr-12 md:pr-16">
                        <p className="text-slate-700 leading-tight break-all whitespace-normal">{f.files.length > 0 ? f.files[0].name : 'Sin archivo'}</p>
                      </div>
                      {/* Cambio vs legacy: botón "Ver" visible en móvil/foco (antes solo con hover). */}
                      {f.files.length > 0 && (
                        <button type="button" onClick={() => openPdf(f.files[0], f.files[0].name)} aria-label={`Ver ${f.files[0].name}`}
                          className="absolute inset-y-0 right-0 px-3 bg-primary hover:bg-primary-hover text-white flex items-center justify-center gap-1 [@media(hover:hover)]:opacity-0 group-hover/file:opacity-100 focus:opacity-100 transition-opacity font-semibold text-xs">
                          <i className="fas fa-eye" aria-hidden="true" /> <span className="hidden md:inline">Ver</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <i className="fas fa-comment-dots text-slate-400 text-sm" aria-hidden="true" />
              <span className="text-sm font-semibold text-slate-900">Observaciones Adicionales</span>
            </div>
            <div id="previewObservacionesContainer" className="p-4">
              <p id="previewObservaciones" className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{v.observaciones || 'Sin observaciones'}</p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onBack} disabled={submitting}
            className="ui-btn ui-btn-secondary">
            <i className="fas fa-arrow-left" aria-hidden="true" />Retroceder y Editar
          </button>
          <button type="button" onClick={onConfirm} disabled={submitting} data-testid="confirmar-solicitud"
            className="ui-btn ui-btn-primary">
            <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-check-circle'}`} aria-hidden="true" />Confirmar Solicitud
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
