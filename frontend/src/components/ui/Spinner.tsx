export function LoadingRow({ text = 'Cargando...', colSpan = 1 }: { text?: string; colSpan?: number }) {
  return (
    <tr><td colSpan={colSpan} className="py-10 text-center text-sm text-slate-500"><span className="inline-flex items-center gap-3" role="status"><span className="spinner" aria-hidden="true" />{text}</span></td></tr>
  );
}
export function PageLoader({ text = 'Cargando...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500" role="status">
      <span className="spinner" aria-hidden="true" />{text}
    </div>
  );
}
