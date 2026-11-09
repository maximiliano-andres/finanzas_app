import { useMemo } from 'react';
import { useSolicitudes } from '@/api/queries';
import { PageLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/features/aprobaciones/WorkflowTable';
import { useWorkflowUi } from '@/features/aprobaciones/useWorkflowUi';
import { usePdfActions } from '@/features/aprobaciones/usePdfActions';
import { groupByEmpresaTipo, isFinanzasRow } from '@/features/aprobaciones/workflowLogic';
import { FinanzasGroup } from './FinanzasGroup';
import { useFinanzasMass } from './useFinanzasMass';

/** Sección "Gestión Finanzas" (Workflow.loadFinanzas). */
export default function FinanzasPage() {
  const { data, isLoading, isError, error } = useSolicitudes();
  const all = useMemo(() => data ?? [], [data]);
  const ui = useWorkflowUi();
  const pdf = usePdfActions();
  const mass = useFinanzasMass(all);
  const groups = useMemo(() => groupByEmpresaTipo(all.filter(isFinanzasRow)), [all]);

  return (
    <section id="sectionFinanzas" className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-dollar-sign" aria-hidden="true" />Gestión Finanzas</h2>
        </div>
      </header>
      <div id="contenedorFinanzasEmpresas" className="space-y-6">
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <EmptyState icon="fa-exclamation-triangle text-red-400" text={`Error al cargar las solicitudes: ${(error as Error)?.message ?? ''}`} />
        ) : groups.length === 0 ? (
          <EmptyState icon="fa-wallet text-slate-300" text="No hay solicitudes para gestión de finanzas" />
        ) : (
          groups.map((g) => <FinanzasGroup key={`${g.empresa}|${g.tipo}`} group={g} ui={ui} pdf={pdf} mass={mass} />)
        )}
      </div>
      {ui.modals}
    </section>
  );
}
