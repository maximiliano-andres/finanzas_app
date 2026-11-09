/** Sección "Estados de Solicitudes" (dashboard.html:685-875 + app.js loadTodasSolicitudes/filtrarSolicitudes/aplicarFiltros). */
import { useDeferredValue, useMemo, useState } from 'react';
import { useSolicitudes } from '@/api/queries';
import { useCurrentUser } from '@/auth/AuthProvider';
import { HelpButton } from '@/components/manual/ManualProvider';
import { Pagination, paginate } from '@/components/ui/Pagination';
import { AccordionBody, AccordionToggle, HELP_ON_GRADIENT } from '@/features/solicitud-detalle/listParts';
import { useSolicitudDetail } from '@/features/solicitud-detalle/useSolicitudDetail';
import { CRITERIOS_VACIOS, filtrarSolicitudes, visiblesTodas, type Criterios } from './filters';
import { FiltrosPanel } from './FiltrosPanel';
import { TodasTable } from './TodasTable';

const ACC_ID = 'todas-solicitudes-global';

export default function TodasSolicitudesPage() {
  const user = useCurrentUser();
  const { data, isLoading } = useSolicitudes();
  // Los filtros se reinician cada vez que se abre la sección (estado local del componente), como el original.
  const [criterios, setCriterios] = useState<Criterios>(CRITERIOS_VACIOS);
  const [page, setPage] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  // Cambio vs legacy: el filtrado se difiere (useDeferredValue) para no bloquear la escritura (antes re-render por cada tecla).
  const deferred = useDeferredValue(criterios);
  const { openDetail, detailModal } = useSolicitudDetail(data);

  const visibles = useMemo(() => visiblesTodas(data ?? [], user), [data, user]);
  const filtradas = useMemo(() => filtrarSolicitudes(visibles, deferred), [visibles, deferred]);
  // Cambio vs legacy (bug #6): paginación funcional sobre TODAS las filas filtradas (antes solo las primeras 50 eran accesibles).
  const { pageRows, totalPages, current } = paginate(filtradas, page);

  const change = (c: Criterios) => { setCriterios(c); setPage(1); };

  return (
    <section id="sectionTodasSolicitudes" className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-folder-open" aria-hidden="true" />Estados de Solicitudes</h2>
          <p className="page-subtitle">Consulta y filtra el estado de todas las solicitudes del sistema.</p>
        </div>
      </header>
      <FiltrosPanel value={criterios} onChange={change} onLimpiar={() => change(CRITERIOS_VACIOS)} />

      <div className="ui-card run-in-sequence">
        <div className="ui-card-header">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="ui-card-title"><i className="fas fa-table-list" aria-hidden="true" />Todas las Solicitudes</h3>
            <HelpButton sectionId="todas-solicitudes-columns" variant="table" style={HELP_ON_GRADIENT} />
            {/* Cambio vs legacy (bug #6): el contador se actualiza con el total filtrado (antes quedaba fijo en "0 registros"). */}
            <span className="ui-chip tabular-nums" id="totalSolicitudesBadge" aria-live="polite">
              {filtradas.length} registros
            </span>
          </div>
          <AccordionToggle id={ACC_ID} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        </div>

        <AccordionBody id={ACC_ID} collapsed={collapsed}>
          <TodasTable rows={pageRows} onOpen={openDetail} loading={isLoading} />
        </AccordionBody>

        <div className="ui-card-footer flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="text-xs text-slate-500">Listado completo de solicitudes del sistema</div>
          <Pagination id="pagination-todas-solicitudes" page={current} totalPages={totalPages} total={filtradas.length} onChange={setPage} />
        </div>
      </div>
      {detailModal}
    </section>
  );
}
