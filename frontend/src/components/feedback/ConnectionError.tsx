import { useQueryClient } from '@tanstack/react-query';
import { SESSION_KEY } from '@/auth/AuthProvider';

/** Pantalla cuando el servidor no responde (API caída / 5xx): mensaje claro + reintento, sin perder la URL. */
export function ConnectionError({ message }: { message: string }) {
  const qc = useQueryClient();
  return (
    <div role="alert" data-testid="connection-error" className="min-h-screen flex flex-col items-center justify-center text-center p-8 gap-3 bg-[var(--bg-app)]">
      <span className="w-14 h-14 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] flex items-center justify-center mb-2" aria-hidden="true">
        <i className="fas fa-plug-circle-exclamation text-xl" />
      </span>
      <h1 className="text-xl font-semibold text-slate-900">No se pudo conectar con el servidor</h1>
      <p className="text-slate-500 max-w-md text-sm">{message}</p>
      <button type="button" onClick={() => void qc.refetchQueries({ queryKey: SESSION_KEY })}
        className="ui-btn ui-btn-primary mt-3">
        <i className="fas fa-rotate-right" aria-hidden="true" />Reintentar
      </button>
    </div>
  );
}
