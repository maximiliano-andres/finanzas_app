import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

/** Error inesperado de render: mensaje claro sin exponer detalles internos. */
export function RouteErrorBoundary() {
  const err = useRouteError();
  if (import.meta.env.DEV) console.error(err);
  const isChunk = err instanceof Error && /dynamically imported module|Loading chunk|Failed to fetch/i.test(err.message);
  return (
    <div role="alert" className="min-h-[50vh] flex flex-col items-center justify-center text-center p-8 gap-3">
      <span className="w-14 h-14 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] flex items-center justify-center mb-2" aria-hidden="true">
        <i className="fas fa-exclamation-triangle text-xl" />
      </span>
      <h1 className="text-xl font-semibold text-slate-900">{isRouteErrorResponse(err) && err.status === 404 ? 'Página no encontrada' : 'Ocurrió un error inesperado'}</h1>
      <p className="text-slate-500 text-sm max-w-md">
        {isChunk ? 'Se publicó una nueva versión de la aplicación. Recargue la página para continuar.' : 'Recargue la página. Si el problema persiste, contacte al administrador.'}
      </p>
      <button type="button" onClick={() => window.location.reload()} className="ui-btn ui-btn-primary mt-3"><i className="fas fa-rotate-right" aria-hidden="true" />Recargar</button>
    </div>
  );
}
