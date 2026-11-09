import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Diálogos (modals.js: showConfirm / showAlert / showError) con cola, ESC y clic en fondo.
 * Mensajes como ReactNode o texto (sin innerHTML). Devuelven Promesas → sin callbacks anidados.
 */
type AlertType = 'success' | 'error' | 'warning' | 'info';
type DialogSpec =
  | { kind: 'confirm'; title: string; message: ReactNode; resolve: (v: boolean) => void }
  | { kind: 'alert'; type: AlertType; message: ReactNode; resolve: (v: boolean) => void }
  | { kind: 'error'; message: ReactNode; details?: string | null; resolve: (v: boolean) => void };

interface DialogApi {
  confirm: (title: string, message: ReactNode) => Promise<boolean>;
  alert: (message: ReactNode, type?: AlertType) => Promise<void>;
  error: (message: ReactNode, details?: string | null) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

const ALERT_ICONS: Record<AlertType, string> = { success: 'fa-check', error: 'fa-exclamation', warning: 'fa-exclamation-triangle', info: 'fa-info' };
const ALERT_TITLES: Record<AlertType, string> = { success: 'Éxito', error: 'Error', warning: 'Advertencia', info: 'Información' };
const ALERT_TONE: Record<AlertType, string> = {
  success: 'bg-[var(--success-bg)] text-[var(--success)]', error: 'bg-[var(--danger-bg)] text-[var(--danger)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning)]', info: 'bg-[var(--info-bg)] text-[var(--info)]',
};

/** Cabecera común: icono semántico + título (no depende solo del color). */
function DialogHeader({ icon, tone, title }: { icon: string; tone: string; title: ReactNode }) {
  return (
    <div className="modal-header !border-b-0 !pb-0 flex items-start gap-4">
      <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${tone}`} aria-hidden="true">
        <i className={`fas ${icon}`} />
      </span>
      <h3 id="customModalTitle" className="modal-title pt-2 first-letter:uppercase">{title}</h3>
    </div>
  );
}

const MSG = 'modal-message whitespace-pre-line';

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogSpec[]>([]);
  const [visible, setVisible] = useState(false);
  const current = queue[0];
  const primaryRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<Element | null>(null);

  const enqueue = useCallback((d: DialogSpec) => setQueue((q) => [...q, d]), []);
  const api: DialogApi = {
    confirm: useCallback((title, message) => new Promise<boolean>((resolve) => enqueue({ kind: 'confirm', title, message, resolve })), [enqueue]),
    alert: useCallback((message, type = 'info') => new Promise<void>((resolve) => enqueue({ kind: 'alert', type, message, resolve: () => resolve() })), [enqueue]),
    error: useCallback((message, details) => new Promise<void>((resolve) => enqueue({ kind: 'error', message, details, resolve: () => resolve() })), [enqueue]),
  };

  const close = useCallback((result: boolean) => {
    if (!current) return;
    setVisible(false);
    setTimeout(() => {
      current.resolve(result);
      setQueue((q) => q.slice(1));
      (lastFocus.current as HTMLElement | null)?.focus?.();
    }, 300);
  }, [current]);

  useEffect(() => {
    if (!current) return;
    lastFocus.current = document.activeElement;
    const t = setTimeout(() => { setVisible(true); primaryRef.current?.focus(); }, 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey, true); };
  }, [current, close]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && (
        <div
          id="customModal"
          className={`modal-overlay ${visible ? 'modal-show' : ''}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}
          role="presentation"
        >
          <div className={`modal-container !max-w-md ${current.kind === 'alert' ? `modal-alert modal-${current.type}` : current.kind === 'confirm' ? 'modal-confirm' : 'modal-warning'}`}
            role={current.kind === 'confirm' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="customModalTitle">
            {current.kind === 'confirm' && (
              <>
                <DialogHeader icon="fa-question" tone="bg-[var(--primary-soft)] text-[var(--primary)]" title={current.title} />
                <div className="modal-body sm:!pl-[4.75rem] !pt-3">
                  <div className={MSG}>{current.message}</div>
                </div>
                <div className="modal-footer">
                  <button type="button" id="modalCancelBtn" onClick={() => close(false)} className="ui-btn ui-btn-secondary">
                    Cancelar
                  </button>
                  <button type="button" id="modalConfirmBtn" ref={primaryRef} onClick={() => close(true)} className="ui-btn ui-btn-primary">
                    <i className="fas fa-check" aria-hidden="true" />Confirmar
                  </button>
                </div>
              </>
            )}
            {current.kind === 'alert' && (
              <>
                <DialogHeader icon={ALERT_ICONS[current.type]} tone={ALERT_TONE[current.type]} title={ALERT_TITLES[current.type]} />
                <div className="modal-body sm:!pl-[4.75rem] !pt-3">
                  <div className={MSG}>{current.message}</div>
                </div>
                <div className="modal-footer">
                  <button type="button" id="modalOkBtn" ref={primaryRef} onClick={() => close(true)} className="ui-btn ui-btn-primary min-w-[8rem]">
                    Entendido
                  </button>
                </div>
              </>
            )}
            {current.kind === 'error' && (
              <>
                <DialogHeader icon="fa-exclamation-triangle" tone={ALERT_TONE.warning} title="proceso bloqueado hasta cumplir con el detalle tecnico" />
                <div className="modal-body sm:!pl-[4.75rem] !pt-3">
                  <div className={MSG}>{current.message}</div>
                  {current.details && (
                    <div className="mt-4 p-4 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg">
                      <p className="text-xs font-semibold text-[var(--warning)] mb-2 flex items-center gap-2">
                        <i className="fas fa-circle-info" aria-hidden="true" /> Detalles técnicos
                      </p>
                      <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        <pre className="text-xs text-[var(--text-secondary)] font-mono whitespace-pre-wrap leading-relaxed">{current.details}</pre>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" ref={primaryRef} onClick={() => close(true)} className="ui-btn ui-btn-primary min-w-[8rem]">
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog debe usarse dentro de <DialogProvider>');
  return ctx;
}
