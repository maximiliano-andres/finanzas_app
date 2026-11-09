import { Link } from 'react-router-dom';

/** 404 dentro de la SPA. Corrige B14: el enlace lleva al inicio real (antes apuntaba a "/" sin ruta). */
export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 gap-3 bg-[var(--bg-app)]">
      <span className="text-sm font-semibold text-slate-500 tracking-wider">ERROR 404</span>
      <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Página no encontrada</h1>
      <p className="text-slate-500 text-sm max-w-md">La página solicitada no existe o fue movida. Verifique la dirección e intente nuevamente.</p>
      <Link to="/" className="ui-btn ui-btn-primary mt-3"><i className="fas fa-arrow-left" aria-hidden="true" />Volver al inicio</Link>
    </main>
  );
}
