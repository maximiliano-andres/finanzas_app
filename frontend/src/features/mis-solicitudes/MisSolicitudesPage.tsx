/** Sección "Mis Solicitudes" (dashboard.html:644-650 + app.js loadMisSolicitudes 1138-1381). */
import { useMemo } from 'react';
import { useSolicitudes } from '@/api/queries';
import { useCurrentUser } from '@/auth/AuthProvider';
import { useSolicitudDetail } from '@/features/solicitud-detalle/useSolicitudDetail';
import { agruparPorEmpresaYTipo, misSolicitudesVisibles } from './misSolicitudesLogic';
import { MisSolicitudesCard } from './MisSolicitudesCard';
import { useEnviarAprobacion } from './useEnviarAprobacion';

export default function MisSolicitudesPage() {
  const user = useCurrentUser();
  const { data, isLoading, isError } = useSolicitudes();
  const grupos = useMemo(() => agruparPorEmpresaYTipo(misSolicitudesVisibles(data ?? [], user)), [data, user]);
  const { openDetail, detailModal } = useSolicitudDetail(data);
  const { enviar, sending } = useEnviarAprobacion();

  let body;
  if (isLoading) {
    body = <div className="ui-card p-10 text-center text-sm text-slate-500" role="status"><span className="inline-flex items-center gap-3"><span className="spinner" aria-hidden="true" />Cargando solicitudes...</span></div>;
  } else if (isError) {
    body = <div className="rounded-lg border px-4 py-3 text-sm bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]">Error al cargar las solicitudes</div>;
  } else if (!grupos.length) {
    body = (
      <div className="ui-card p-10 text-center text-sm text-slate-500">
        <i className="fas fa-file-invoice text-3xl mb-3 text-slate-300" aria-hidden="true" />
        <p>No tienes solicitudes registradas</p>
      </div>
    );
  } else {
    body = grupos.map((g) => <MisSolicitudesCard key={g.cardId} grupo={g} onOpen={openDetail} enviar={enviar} sending={sending} />);
  }

  return (
    <section id="sectionMisSolicitudes" className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-list" aria-hidden="true" />Mis Solicitudes</h2>
        </div>
      </header>
      <div id="contenedorTablasEmpresas" className="space-y-6">{body}</div>
      {detailModal}
    </section>
  );
}
