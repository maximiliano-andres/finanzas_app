/** Secciones del voucher "Detalle de Solicitud" (app.js:2104-2296). Todo el contenido del servidor se renderiza como texto. */
import { usePdfViewer } from '@/components/pdf/PdfViewerProvider';
import { formatCurrency, formatDate, getBadgeClass } from '@/lib/format';
import { getFolios } from '@/lib/solicitud';
import { BrandLockup } from '@/components/ui/BrandMark';
import { fileName, formatFolioMonto, glosaOf, unidadObraOf, type DetailView } from './detailRules';

const LBL = 'text-xs text-slate-500';
const ROW = 'flex flex-col gap-0.5 min-w-0';
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

export function VoucherHeader({ v }: { v: DetailView }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[var(--border)] pb-5 gap-4">
      <div className="flex flex-wrap items-center gap-4 min-w-0">
        <BrandLockup size="lg" />
        <div className="h-10 w-px bg-[var(--border)] hidden md:block" />
        <div>
          <h2 className="text-xl font-semibold text-slate-900 break-words mb-1">Voucher de Registro</h2>
          <p><span className={getBadgeClass(v.estado)}>{v.estado}</span></p>
        </div>
      </div>
      <div className="md:text-right flex flex-col md:items-end">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 flex flex-col md:items-end">
          <span className="text-xs text-slate-500">ID de Solicitud</span>
          <span className="text-lg font-semibold text-slate-900 tabular-nums">#{v.id}</span>
        </div>
      </div>
    </div>
  );
}

export function GeneralInfo({ v }: { v: DetailView }) {
  const unidadObra = unidadObraOf(v);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pb-6 border-b border-[var(--border)]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
        <div className={ROW}><span className={LBL}>Mes de Proceso</span><span className="text-sm font-semibold text-slate-900">{show(v.mesProceso)}</span></div>
        <div className={ROW}><span className={LBL}>Fecha Solicitud</span><span className="text-sm font-semibold text-slate-900">{formatDate(v.fechaProceso)}</span></div>
        <div className={ROW}><span className={LBL}>Fecha Pago Estimada</span><span className="text-sm font-semibold text-slate-900">{formatDate(v.fechaPago)}</span></div>
        <div className="flex flex-col gap-0.5 min-w-0 sm:col-span-2">
          <span className={LBL}>Glosa</span>
          <span className="text-sm font-semibold text-slate-900 break-words">{glosaOf(v)}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 content-start">
        <div className={ROW}><span className={LBL}>Empresa</span><span className="text-sm font-semibold text-slate-900 truncate" title={v.empresaNombre}>{v.empresaNombre}</span></div>
        <div className={ROW}><span className={LBL}>Unidad / Obra</span><span className="text-sm font-semibold text-slate-900 truncate" title={unidadObra}>{unidadObra}</span></div>
        <div className={ROW}><span className={LBL}>Proceso</span><span className="text-sm font-semibold text-slate-900 truncate" title={v.procesoNombre}>{v.procesoNombre}</span></div>
      </div>
    </div>
  );
}

export function FoliosBreakdown({ v }: { v: DetailView }) {
  const openPdf = usePdfViewer();
  const folios = getFolios(v).filter((f) => !!f.folio);
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h4 className="section-title !mb-0">Desglose de Folios y Montos</h4>
        <span className="ui-chip self-start sm:self-auto">Documentos registrados</span>
      </div>
      <div className="space-y-3">
        {folios.length === 0 ? (
          <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-8 flex flex-col items-center justify-center text-slate-500">
            <i className="fas fa-layer-group text-2xl mb-2 text-slate-400" aria-hidden="true" />
            <p className="text-sm">No se encontraron folios registrados</p>
          </div>
        ) : folios.map((f) => {
          const monto = formatFolioMonto(f.monto);
          return (
            <div key={f.index} data-testid={`detalle-folio-${f.index}`} className="p-4 bg-white rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-3 flex flex-col min-w-0">
                <span className={`${LBL} mb-0.5`}>Folio</span>
                <span className="text-sm font-semibold text-slate-900 font-mono inline-block max-w-full break-all whitespace-normal">#{f.folio}</span>
              </div>
              <div className="md:col-span-2 flex flex-col min-w-0">
                <span className={`${LBL} mb-0.5`}>Monto</span>
                <span className="text-sm font-semibold text-slate-900 tabular-nums block w-full truncate" title={monto}>{monto}</span>
              </div>
              <div className="md:col-span-3 flex flex-col min-w-0">
                <span className={`${LBL} mb-0.5`}>Forma de Pago</span>
                <span className="text-sm font-semibold text-slate-900 block w-full break-words whitespace-normal">{f.formaPago || 'N/A'}</span>
              </div>
              <div className="md:col-span-4 flex flex-col min-w-0">
                <span className={`${LBL} mb-0.5`}>Documento del Folio</span>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200 group/file relative overflow-hidden">
                  <div className={`w-8 h-8 rounded-md ${f.pdf ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-400'} flex items-center justify-center shrink-0`}>
                    <i className={`fas ${f.pdf ? 'fa-file-pdf' : 'fa-file-alt'}`} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0 pr-12 md:pr-16">
                    <p className="text-slate-700 leading-tight break-all whitespace-normal">{f.pdf ? fileName(f.pdf) : 'Sin archivo'}</p>
                  </div>
                  {f.pdf && (
                    // Cambio vs legacy: el botón "Ver" también es visible con foco de teclado (antes solo en hover).
                    <button type="button" data-testid={`ver-pdf-folio-${f.index}`} aria-label={`Ver documento del folio ${f.folio}`}
                      onClick={() => openPdf(f.pdf as string, `Folio ${f.folio}`)}
                      className="absolute inset-y-0 right-0 px-3 bg-primary hover:bg-primary-hover text-white flex items-center justify-center gap-1 [@media(hover:hover)]:opacity-0 group-hover/file:opacity-100 focus:opacity-100 transition-opacity font-semibold text-xs">
                      <i className="fas fa-eye" aria-hidden="true" /> <span className="hidden md:inline">Ver</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InfoContable({ v }: { v: DetailView }) {
  const cell = 'flex flex-col gap-0.5 min-w-0';
  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><i className="fas fa-calculator text-slate-400 text-sm" aria-hidden="true" />Información Contable</h4>
      </div>
      <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cell}><span className={LBL}>Unidad (UNE)</span><span className="font-mono text-sm font-semibold text-slate-800">{show(v.unidadDeNegocio)}</span></div>
        <div className={cell}><span className={LBL}>Cuenta Objeto</span><span className="font-mono text-sm font-semibold text-slate-800">{show(v.cuentaContable)}</span></div>
        <div className={cell}><span className={LBL}>Auxiliar</span><span className="font-mono text-sm font-semibold text-slate-800">{show(v.auxiliar)}</span></div>
        <div className="flex flex-col gap-0.5 items-start lg:items-end">
          <span className={LBL}>Monto Total</span>
          <div className="flex items-baseline">
            <span className="text-lg font-semibold text-slate-900 tabular-nums">{formatCurrency(v.monto)}</span>
            <span className="text-xs text-slate-500 ml-1">CLP</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Comment({ title, icon, tone, text }: { title: string; icon: string; tone: 'emerald' | 'orange'; text?: string | null }) {
  const head = tone === 'emerald'
    ? { box: 'bg-[var(--bg-secondary)]', ic: 'text-slate-400', lbl: 'text-slate-900' }
    : { box: 'bg-[var(--warning-bg)]', ic: 'text-[var(--warning)]', lbl: 'text-[var(--warning)]' };
  return (
    <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border)] overflow-hidden">
      <div className={`${head.box} px-4 py-3 border-b border-[var(--border)] flex items-center gap-2`}>
        <i className={`fas ${icon} text-sm ${head.ic}`} aria-hidden="true" />
        <span className={`text-sm font-semibold ${head.lbl}`}>{title}</span>
      </div>
      <div className="p-4 bg-[var(--bg-primary)]">
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
          {text || <span className="text-slate-500">- Sin comentarios adicionales -</span>}
        </p>
      </div>
    </div>
  );
}

export function Comments({ v }: { v: DetailView }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Comment title="Comentario del Solicitante" icon="fa-comment-dots" tone="emerald" text={v.observaciones} />
      {v.observaciones_devolucion && (
        <Comment title="Comentario del Aprobador" icon="fa-exclamation-circle" tone="orange" text={v.observaciones_devolucion} />
      )}
    </div>
  );
}
