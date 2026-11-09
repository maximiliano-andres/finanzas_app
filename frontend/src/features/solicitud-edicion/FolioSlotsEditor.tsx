import { useId } from 'react';
import { usePdfViewer } from '@/components/pdf/PdfViewerProvider';
import { FOLIO_SUFFIXES, FORMA_PAGO_OPTIONS_EDIT, type FolioSlot } from './cuadratura';

export interface FolioSlotsEditorProps {
  slots: FolioSlot[];
  incomplete: boolean[];
  busy: boolean[];
  disabled?: boolean;
  /** Prefijo del contenedor PDF: 'container-pdf-folio' (recepcionado) | 'container-solicitud-pdf-folio'. */
  containerPrefix: string;
  onField: (i: number, field: 'folio' | 'monto' | 'formaPago', value: string) => void;
  onClear: (i: number) => void;
  onUpload: (i: number, file: File | undefined) => void;
  onDeletePdf: (i: number) => void;
}

const INPUT = 'ui-input px-3';
const BAD = ' ring-2 ring-red-500/15 !border-red-500';

/** "Detalle Financiero por Folios": 5 bloques fijos (uno…cinco) compartidos por ambos modales. */
export function FolioSlotsEditor(props: FolioSlotsEditorProps) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 mb-5">
      <h4 className="section-title">
        <i className="fas fa-receipt" aria-hidden="true" /> Detalle Financiero por Folios
      </h4>
      <div className="space-y-3">
        {props.slots.map((s, i) => <SlotCard key={FOLIO_SUFFIXES[i]} index={i} slot={s} {...props} />)}
      </div>
    </div>
  );
}

function SlotCard({ index: i, slot: s, incomplete, busy, disabled, containerPrefix, onField, onClear, onUpload, onDeletePdf }:
  FolioSlotsEditorProps & { index: number; slot: FolioSlot }) {
  const uid = useId();
  const num = FOLIO_SUFFIXES[i];
  const bad = incomplete[i] ? BAD : '';
  const locked = busy[i] || !!disabled;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid={`folio-slot-${num}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center">
            <span className="text-xs font-semibold text-primary tabular-nums">{i + 1}</span>
          </div>
          <h5 className="text-sm font-semibold text-slate-900">Folio {i + 1}</h5>
        </div>
        <button type="button" onClick={() => onClear(i)} disabled={locked} data-folio={num} data-testid={`clear-folio-${num}`}
          title="Limpiar todos los campos de este folio" aria-label={`Limpiar Folio ${i + 1}`}
          className="ui-btn ui-btn-ghost ui-btn-sm hover:!text-red-600 hover:!bg-red-50">
          <i className="fas fa-eraser text-xs" aria-hidden="true" />
          <span>Limpiar</span>
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="min-w-0">
          <label htmlFor={`${uid}-f`} className="ui-label">Número de Folio</label>
          <input id={`${uid}-f`} type="text" name={`folio_${num}`} value={s.folio} disabled={disabled}
            onChange={(e) => onField(i, 'folio', e.target.value)} className={INPUT + bad} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${uid}-m`} className="ui-label">Monto</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm pointer-events-none">$</span>
            <input id={`${uid}-m`} type="text" inputMode="numeric" name={`monto_por_folio_${num}`} value={s.monto} disabled={disabled}
              onChange={(e) => onField(i, 'monto', e.target.value)} className={`${INPUT.replace('px-3', '!pl-7 tabular-nums')}${bad}`} />
          </div>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${uid}-p`} className="ui-label">Forma de Pago</label>
          <select id={`${uid}-p`} name={`forma_pago_folio_${num}`} value={s.formaPago} disabled={disabled}
            onChange={(e) => onField(i, 'formaPago', e.target.value)} className={INPUT + bad}>
            <option value="">Seleccione...</option>
            {FORMA_PAGO_OPTIONS_EDIT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <PdfControl id={`${containerPrefix}-${num}`} index={i} pdf={s.pdf} locked={locked}
          onUpload={(f) => onUpload(i, f)} onDelete={() => onDeletePdf(i)} />
      </div>
    </div>
  );
}

/** getPDFFolioControlHTML (F:2634-2670): archivo con Ver/Eliminar, o "Sin PDF" + "Subir PDF". */
function PdfControl({ id, index, pdf, locked, onUpload, onDelete }: {
  id: string; index: number; pdf: string; locked: boolean; onUpload: (f: File | undefined) => void; onDelete: () => void;
}) {
  const openPdf = usePdfViewer();
  const uid = useId();
  return (
    <div className="min-w-0" id={id}>
      <span className="ui-label">PDF Adjunto</span>
      {pdf ? (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg pl-2.5 pr-1 h-10 group/pdf">
          <i className="fas fa-file-pdf text-red-600" aria-hidden="true" />
          <span className="text-xs font-medium text-slate-700 truncate flex-1 min-w-0" title={pdf.split('/').pop()}>{pdf.split('/').pop()}</span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" onClick={() => openPdf(pdf, `Folio ${index + 1}`)} className="ui-icon-btn" title="Ver PDF" aria-label={`Ver PDF del Folio ${index + 1}`}>
              <i className="fas fa-eye text-xs" aria-hidden="true" />
            </button>
            <button type="button" onClick={onDelete} disabled={locked} className="ui-icon-btn hover:!text-red-600 hover:!bg-red-50" title="Eliminar PDF" aria-label={`Eliminar PDF del Folio ${index + 1}`}>
              <i className="fas fa-trash-alt text-xs" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center h-10 bg-white border border-dashed border-slate-300 rounded-lg">
            <span className="text-xs text-slate-500">Sin PDF</span>
          </div>
          <label htmlFor={uid} className={`ui-btn ui-btn-secondary ui-btn-sm w-full ${locked ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}>
            <i className={`fas ${locked ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} text-xs`} aria-hidden="true" />
            <span>Subir PDF</span>
            <input id={uid} type="file" className="hidden" accept="application/pdf" disabled={locked}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onUpload(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}
