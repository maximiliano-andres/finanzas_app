import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** Notificaciones (utils.js showNotification + NotificationManager). Texto plano: sin innerHTML (XSS). */
export type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; message: string; type: ToastType; duration: number; leaving: boolean }

const ICONS: Record<ToastType, string> = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
const TITLES: Record<ToastType, string> = { success: 'Listo', error: 'Error', warning: 'Atención', info: 'Información' };
const MAX_TOASTS = 3;

type Notify = (message: string, type?: ToastType, duration?: number) => void;
const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>[]>());

  const remove = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    const tm = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
      timers.current.get(id)?.forEach(clearTimeout);
      timers.current.delete(id);
    }, 300);
    timers.current.set(id, [...(timers.current.get(id) ?? []), tm]);
  }, []);

  const notify = useCallback<Notify>((message, type = 'info', duration) => {
    const id = ++seq.current;
    const ms = duration ?? (type === 'error' || type === 'warning' ? 12000 : 8000);
    setToasts((t) => {
      const next = [...t, { id, message: String(message ?? ''), type, duration: ms, leaving: false }];
      const active = next.filter((x) => !x.leaving);
      if (active.length > MAX_TOASTS) {
        const oldest = active[0].id;
        queueMicrotask(() => remove(oldest));
      }
      return next;
    });
    timers.current.set(id, [setTimeout(() => remove(id), ms)]);
  }, [remove]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((arr) => arr.forEach(clearTimeout));
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div id="notificationContainer" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`notification notification-${t.type}`}
            data-testid={`toast-${t.type}`}
            style={{ opacity: t.leaving ? 0 : 1, transform: t.leaving ? 'translateY(-6px)' : 'none' }}
          >
            <i className={`notification-icon fas ${ICONS[t.type]} text-base mt-0.5 shrink-0`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[0.8125rem] font-semibold leading-5">{TITLES[t.type]}</p>
              <p className="text-[0.8125rem] text-[var(--text-secondary)] leading-5 whitespace-pre-line break-words">{t.message}</p>
            </div>
            <button type="button" className="notification-close-btn ui-icon-btn !w-7 !h-7 -mr-1 -mt-0.5" aria-label="Cerrar notificación" onClick={() => remove(t.id)}>
              <i className="fas fa-times text-xs" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return useMemo(() => ctx, [ctx]);
}
