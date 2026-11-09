import { useMemo } from 'react';
import { useSolicitudes } from '@/api/queries';
import { PageLoader } from '@/components/ui/Spinner';
import { AprobacionGroup } from './AprobacionGroup';
import { EmptyState } from './WorkflowTable';
import { useWorkflowUi } from './useWorkflowUi';
import { usePdfActions } from './usePdfActions';
import { groupByEmpresaTipo, isAprobacionRow, type Level } from './workflowLogic';

/** Secciones "Aprobaciones Pendientes Nivel 1/2" (Workflow.loadAprobaciones / loadAprobaciones2). */
export default function AprobacionesPage({ level }: { level: Level }) {
  const { data, isLoading, isError, error } = useSolicitudes();
  const ui = useWorkflowUi();
  const pdf = usePdfActions();
  const groups = useMemo(() => groupByEmpresaTipo((data ?? []).filter(isAprobacionRow(level))), [data, level]);

  return (
    <section id={level === 1 ? 'sectionAprobaciones' : 'sectionAprobaciones2'} className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-check-circle" aria-hidden="true" />Aprobaciones Pendientes Nivel {level}</h2>
        </div>
      </header>
      <div id={level === 1 ? 'contenedorAprobacionesEmpresas' : 'contenedorAprobaciones2Empresas'} className="space-y-6">
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <EmptyState icon="fa-exclamation-triangle text-red-400" text={`Error al cargar las solicitudes: ${(error as Error)?.message ?? ''}`} />
        ) : groups.length === 0 ? (
          <EmptyState icon="fa-file-invoice text-slate-300" text="No hay solicitudes pendientes de aprobación" />
        ) : (
          groups.map((g) => <AprobacionGroup key={`${level}|${g.empresa}|${g.tipo}`} group={g} level={level} ui={ui} pdf={pdf} />)
        )}
      </div>
      {ui.modals}
    </section>
  );
}
