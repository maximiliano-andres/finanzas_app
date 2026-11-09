/** Filas de folio del formulario de creación (folio.js: 1–5 filas, PDFs por folio, arrastrar y soltar). */
import { useId, useState, type DragEvent } from 'react';
import { usePdfViewer } from '@/components/pdf/PdfViewerProvider';
import { useToast } from '@/components/feedback/ToastProvider';
import { FORMA_PAGO_OPTIONS_CREATE, MAX_FOLIOS, formatMontoInput, isPdfFile, type FolioRow, type FolioRowErrors } from './logic';
import { newFolioRow } from './useNuevaSolicitud';

const BASE = 'ui-input';
const cls = (extra: string, err?: string) => `${BASE} ${extra} ${err ? '!border-red-500 ring-2 ring-red-500/15' : ''}`;

function FolioErrorMsg({ msg }: { msg?: string }) {
  return msg ? <span className="folio-error-msg block mt-1 pl-0.5 text-[0.6875rem] leading-snug font-medium text-[var(--danger)]">{msg}</span> : null;
}

export function FolioRowsEditor({ rows, errors, onChange }: {
  rows: FolioRow[]; errors: FolioRowErrors[]; onChange: (fn: (rows: FolioRow[]) => FolioRow[]) => void;
}) {
  // Cambio vs legacy: el estado del botón se recalcula siempre (antes quedaba deshabilitado tras limpiar con 5 folios, B-22).
  const atMax = rows.length >= MAX_FOLIOS;
  const update = (key: number, patch: Partial<FolioRow>) => onChange((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => onChange((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const add = () => onChange((rs) => (rs.length >= MAX_FOLIOS ? rs : [...rs, newFolioRow()]));

  return (
    <div className="space-y-4">
      <span className="ui-label !mb-0">
        Folios, Documentos y Montos <span className="text-[var(--danger)]">*</span>
      </span>
      {rows.map((r, i) => <FolioRowItem key={r.key} row={r} err={errors[i] ?? {}} onUpdate={(p) => update(r.key, p)} onRemove={() => remove(r.key)} />)}
      <button type="button" id="add-folio" onClick={add} disabled={atMax}
        title={atMax ? `Máximo ${MAX_FOLIOS} folios permitidos` : 'Agregar otro folio'}
        className={`ui-btn ui-btn-secondary ui-btn-sm ${atMax ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <i className="fas fa-plus-circle" aria-hidden="true" /> Agregar otro folio
      </button>
    </div>
  );
}

function FolioRowItem({ row, err, onUpdate, onRemove }: {
  row: FolioRow; err: FolioRowErrors; onUpdate: (p: Partial<FolioRow>) => void; onRemove: () => void;
}) {
  const uid = useId();
  const openPdf = usePdfViewer();
  const notify = useToast();
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    const pdfs = dropped.filter(isPdfFile);
    // Cambio vs legacy: el arrastre solo acepta PDF (antes aceptaba cualquier archivo, sin validación).
    if (pdfs.length < dropped.length) notify('Solo se permiten archivos PDF', 'error');
    if (pdfs.length) onUpdate({ files: pdfs });
  };

  return (
    <div data-folio-item className="folio-item p-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="folio-grid">
      <div className="min-w-0">
        <label htmlFor={`${uid}-f`} className="ui-label">Número de Folio</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><i className="fas fa-hashtag text-xs" aria-hidden="true" /></div>
          <input id={`${uid}-f`} type="text" name="folio[]" value={row.folio} placeholder="EJ: 4500XXX" title={err.folio ?? ''}
            onChange={(e) => onUpdate({ folio: e.target.value })} className={`folio-input ${cls('!pl-8', err.folio)}`} />
        </div>
        <FolioErrorMsg msg={err.folio} />
      </div>
      <div className="min-w-0">
        <label htmlFor={`${uid}-m`} className="ui-label">Monto</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-semibold">$</div>
          {/* Cambio vs legacy: máscara es-CL de miles al escribir (el envío sigue usando solo dígitos). */}
          <input id={`${uid}-m`} type="text" inputMode="numeric" name="folios_monto[]" value={row.monto} placeholder="0" title={err.monto ?? ''}
            onChange={(e) => onUpdate({ monto: formatMontoInput(e.target.value) })} className={cls('!pl-7 tabular-nums', err.monto)} />
        </div>
        <FolioErrorMsg msg={err.monto} />
      </div>
      <div className="min-w-0">
        <label htmlFor={`${uid}-p`} className="ui-label">Forma Pago</label>
        <div className="relative">
          <select id={`${uid}-p`} name="forma_pago[]" value={row.formaPago} title={err.formaPago ?? ''}
            onChange={(e) => onUpdate({ formaPago: e.target.value })} className={cls('', err.formaPago)}>
            <option value="">Seleccione...</option>
            {FORMA_PAGO_OPTIONS_CREATE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <FolioErrorMsg msg={err.formaPago} />
      </div>
      <div className="min-w-0">
        <span className="ui-label">PDF Asociado</span>
        <div className="relative">
          {row.files.length === 0 ? (
            <label htmlFor={`${uid}-d`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
              className={`pdf-button-label flex items-center justify-center gap-2 px-4 rounded-lg border border-dashed border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50 cursor-pointer transition-colors text-slate-600 font-medium text-sm h-10 ${dragOver ? 'dropzone-active' : ''}`}>
              <i className="fas fa-file-pdf text-slate-400" aria-hidden="true" />
              <span>Seleccionar PDF</span>
              <input id={`${uid}-d`} type="file" name="documentos[]" multiple accept=".pdf" className="documentos-input hidden"
                onChange={(e) => {
                  // Cambio vs legacy: también se valida el tipo al usar el selector (accept=".pdf" no impide otros archivos).
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  const pdfs = picked.filter(isPdfFile);
                  if (pdfs.length < picked.length) notify('Solo se permiten archivos PDF', 'error');
                  if (pdfs.length) onUpdate({ files: pdfs });
                }} />
            </label>
          ) : (
            <div className="file-list-folio space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
              {row.files.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="flex justify-between items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="bg-red-50 text-red-600 w-8 h-8 rounded-md flex items-center justify-center shrink-0">
                      <i className="fas fa-file-pdf" aria-hidden="true" />
                    </div>
                    <div className="overflow-hidden flex-1">
                      <p className="font-medium text-slate-800 text-sm truncate">{f.name}</p>
                      <span className="text-[0.6875rem] text-slate-500 tabular-nums">{(f.size / 1024).toFixed(2)} KB</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" className="view-pdf-btn ui-icon-btn" title="Previsualizar" aria-label={`Previsualizar ${f.name}`}
                      onClick={() => openPdf(f, f.name)}><i className="fas fa-eye" aria-hidden="true" /></button>
                    <button type="button" className="remove-pdf-btn ui-icon-btn hover:!text-red-600 hover:!bg-red-50" title="Eliminar" aria-label={`Eliminar ${f.name}`}
                      onClick={() => onUpdate({ files: row.files.filter((_, j) => j !== idx) })}><i className="fas fa-trash-alt" aria-hidden="true" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="folio-col-remove flex flex-col items-end">
        {/* Separador del alto de una etiqueta: alinea el botón con los campos en la vista de una fila */}
        <span className="ui-label folio-remove-spacer invisible" aria-hidden="true">&nbsp;</span>
        <button type="button" data-remove onClick={onRemove} title="Eliminar folio" aria-label="Eliminar folio"
          className="ui-btn ui-btn-danger-outline !px-0 w-10 h-10">
          <i className="fas fa-trash-alt" aria-hidden="true" />
        </button>
      </div>
      </div>
    </div>
  );
}
