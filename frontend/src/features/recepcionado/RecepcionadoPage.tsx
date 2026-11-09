/** Sección "Solicitudes Recepcionadas" (app.js loadRecepcionado 672-873). */
import { useMemo, useState } from 'react';
import { useRecepcionado } from '@/api/queries';
import { useCurrentUser } from '@/auth/AuthProvider';
import type { Recepcionado } from '@/lib/solicitud';
import EditRecepcionadoModal from '@/features/solicitud-edicion/EditRecepcionadoModal';
import { useSolicitudDetail } from '@/features/solicitud-detalle/useSolicitudDetail';
import { groupBy } from '@/features/solicitud-detalle/listUtils';
import { recepcionadosVisibles } from './recepcionadoLogic';
import { RecepcionadoCard } from './RecepcionadoCard';

export default function RecepcionadoPage() {
  const user = useCurrentUser();
  const { data, isLoading, isError, error } = useRecepcionado();
  const visibles = useMemo(() => recepcionadosVisibles(data ?? [], user), [data, user]);
  const grupos = useMemo(() => groupBy(visibles, (h) => h.empresa), [visibles]);
  const { openDetail, detailModal } = useSolicitudDetail(visibles, true);
  const [editing, setEditing] = useState<Recepcionado | null>(null);

  let body;
  if (isLoading) {
    body = <div className="ui-card p-10 text-center text-sm text-slate-500" role="status"><span className="inline-flex items-center gap-3"><span className="spinner" aria-hidden="true" />Cargando recepcionado...</span></div>;
  } else if (isError) {
    body = (
      <div className="ui-card p-10 text-center text-sm text-[var(--danger)]">
        <i className="fas fa-exclamation-triangle text-3xl mb-3" aria-hidden="true" />
        <p>Error al cargar datos</p>
        <p className="text-sm mt-2">{error?.message}</p>
      </div>
    );
  } else if (!visibles.length) {
    body = (
      <div className="ui-card p-10 text-center text-sm text-slate-500">
        <i className="fas fa-database text-3xl mb-3 text-slate-300" aria-hidden="true" />
        <p>No hay registros de recepcionado</p>
      </div>
    );
  } else {
    body = grupos.map(([empresa, rows]) => (
      <RecepcionadoCard key={empresa} empresa={empresa} rows={rows} onOpen={openDetail} onModificar={setEditing} />
    ));
  }

  return (
    <section id="sectionRecepcionado" className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-inbox" aria-hidden="true" />Solicitudes Recepcionadas</h2>
        </div>
      </header>
      <div className="space-y-6">{body}</div>
      {detailModal}
      {editing && <EditRecepcionadoModal recepcionado={editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </section>
  );
}
