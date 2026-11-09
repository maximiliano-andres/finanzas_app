import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { pdfApi } from '@/api/endpoints';

/**
 * Visor de PDF (viewer.js). Acepta File/Blob local o ruta del servidor (doc_pdf/…, PDF_firmados/…, PDF_autorizaciones/…).
 * Correcciones respecto al original (documentadas): descarga usa la MISMA URL que la vista;
 * el nombre descargado conserva extensión .pdf; sin carreras al abrir/cerrar rápido (token de solicitud).
 */
type Open = (source: string | Blob, title?: string) => void;
const PdfContext = createContext<Open | null>(null);

export function PdfViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; title: string; url: string | null; loading: boolean; error: boolean; filename: string }>({
    open: false, title: 'Cargando documento...', url: null, loading: false, error: false, filename: 'documento.pdf',
  });
  const urlRef = useRef<string | null>(null);
  const reqId = useRef(0);

  const revoke = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const open = useCallback<Open>((source, title = 'Documento Soporte') => {
    const id = ++reqId.current;
    revoke();
    const filenameFrom = (s: string | Blob) =>
      typeof s === 'string' ? decodeURIComponent(s.split('/').pop() || 'documento.pdf') : s instanceof File ? s.name : 'documento.pdf';
    setState({ open: true, title, url: null, loading: true, error: false, filename: filenameFrom(source) });
    const load = typeof source === 'string' ? pdfApi.fetchBlob(source) : Promise.resolve(source);
    load
      .then((blob) => {
        if (id !== reqId.current) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setState((s) => ({ ...s, url }));
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setState((s) => ({ ...s, loading: false, error: true, title: 'Error al cargar documento' }));
      });
  }, []);

  const close = useCallback(() => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, open: false, url: null }));
    // Revocar tras la animación, salvo que se haya abierto otro documento entretanto (bug del original).
    setTimeout(() => { if (id === reqId.current) revoke(); }, 300);
  }, []);

  const download = () => {
    if (!urlRef.current) return;
    const a = document.createElement('a');
    a.href = urlRef.current;
    a.download = state.filename.toLowerCase().endsWith('.pdf') ? state.filename : `${state.filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, close]);

  useEffect(() => () => revoke(), []);

  return (
    <PdfContext.Provider value={open}>
      {children}
      <div
        id="pdfViewerModal"
        aria-hidden={!state.open}
        className={`fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center z-[2000] p-0 sm:p-4 transition-all duration-300 ${state.open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {state.open && (
          <div role="dialog" aria-modal="true" aria-label="Visor de Documentos"
            className="bg-white w-full h-full sm:max-w-6xl sm:h-[90vh] sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col sm:border border-[var(--border)]">
            <div className="px-4 sm:px-5 h-14 bg-white border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 shrink-0 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><i className="fas fa-file-pdf" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-slate-900">Visor de Documentos</h3>
                  <p id="pdfViewerTitle" title={state.title} className="text-xs text-slate-500 truncate">{state.title}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={download} disabled={!state.url} className="ui-btn ui-btn-secondary ui-btn-sm" title="Descargar" aria-label="Descargar">
                  <i className="fas fa-download" aria-hidden="true" /><span className="hidden sm:inline">Descargar</span>
                </button>
                <button type="button" onClick={close} className="ui-icon-btn !w-9 !h-9" title="Cerrar" aria-label="Cerrar visor">
                  <i className="fas fa-times" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 relative overflow-hidden">
              {state.loading && (
                <div id="pdfLoader" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white z-10">
                  <span className="spinner spinner-large" aria-hidden="true" />
                  <p className="text-sm text-slate-500" role="status">Optimizando Vista...</p>
                </div>
              )}
              {state.url && (
                <iframe id="pdfFrame" title={state.title} className="w-full h-full border-none" src={state.url}
                  onLoad={() => setState((s) => ({ ...s, loading: false }))} />
              )}
            </div>
          </div>
        )}
      </div>
    </PdfContext.Provider>
  );
}

export function usePdfViewer(): Open {
  const ctx = useContext(PdfContext);
  if (!ctx) throw new Error('usePdfViewer debe usarse dentro de <PdfViewerProvider>');
  return ctx;
}
