/** Sección "Dashboard HOME" (dashboard.html:192-288 + app.js loadDashboard 903-1078). */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSolicitudes } from '@/api/queries';
import { useCurrentUser } from '@/auth/AuthProvider';
import { HelpButton } from '@/components/manual/ManualProvider';
import { pathFor } from '@/app/sections';
import { useSolicitudDetail } from '@/features/solicitud-detalle/useSolicitudDetail';
import { dashboardSolicitudes, dashboardStats, recientes } from './dashboardStats';
import { RecentTable } from './RecentTable';

const STAT_CARDS = [
  { id: 'statPendientes', key: 'pendientes', label: 'Solicitudes Pendientes', hint: 'Pendientes o en espera', icon: 'fa-clock', tone: 'bg-[var(--warning-bg)] text-[var(--warning)]' },
  { id: 'statAprobadas', key: 'aprobadas', label: 'Solicitudes Aprobadas', hint: 'Aprobadas en cualquier nivel', icon: 'fa-check', tone: 'bg-[var(--success-bg)] text-[var(--success)]' },
  { id: 'statRechazadas', key: 'rechazadas', label: 'Solicitudes Rechazadas', hint: 'Requieren corrección', icon: 'fa-times', tone: 'bg-[var(--danger-bg)] text-[var(--danger)]' },
  { id: 'statTotal', key: 'total', label: 'Total de Solicitudes', hint: 'Visibles para tu rol', icon: 'fa-file-alt', tone: 'bg-[var(--primary-soft)] text-[var(--primary)]' },
] as const;

export default function DashboardPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { data, isLoading } = useSolicitudes();
  const visibles = useMemo(() => dashboardSolicitudes(data ?? [], user), [data, user]);
  const stats = useMemo(() => dashboardStats(visibles), [visibles]);
  const recent = useMemo(() => recientes(visibles), [visibles]);
  const { openDetail, detailModal } = useSolicitudDetail(data);

  return (
    <section id="sectionDashboard" className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-chart-line" aria-hidden="true" />Dashboard HOME</h2>
          <p className="page-subtitle">Resumen del estado de las solicitudes de pago.</p>
        </div>
      </header>

      <h4 className="section-title"><i className="fas fa-circle-info" aria-hidden="true" />Estado de Solicitudes</h4>
      <div className="stat-grid-wrap mb-8">
      <div className="stat-grid">
        {STAT_CARDS.map((c) => (
          <div key={c.id} className="stat-card ui-card p-4 sm:p-5 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-[0.8125rem] sm:text-sm font-medium text-slate-600 leading-snug">{c.label}</p>
              <span className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-lg flex items-center justify-center text-sm ${c.tone}`} aria-hidden="true">
                <i className={`fas ${c.icon}`} />
              </span>
            </div>
            <h3 className="text-[1.75rem] sm:text-[2rem] font-semibold text-slate-900 tracking-tight tabular-nums leading-none mt-2" id={c.id}>{stats[c.key]}</h3>
            <p className="text-xs text-slate-500 mt-2">{c.hint}</p>
          </div>
        ))}
      </div>
      </div>

      <div className="ui-card">
        <div className="ui-card-header">
          <h5 className="ui-card-title">
            <i className="fas fa-bell" aria-hidden="true" />Solicitudes Recientes
            <HelpButton sectionId="solicitudes-recientes-columns" variant="table" />
          </h5>
          <button type="button" data-testid="ver-todas-mis-solicitudes" onClick={() => navigate(pathFor('misSolicitudes'))}
            className="group ui-btn ui-btn-secondary ui-btn-sm">
            Ver todas mis solicitudes
            <i className="fas fa-arrow-right text-[0.6875rem] text-slate-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </div>
        <div id="recentSolicitudes" className="table-responsive-container rounded-b-xl">
          {isLoading ? (
            <p className="empty-state" role="status"><span className="spinner" aria-hidden="true" />Cargando...</p>
          ) : recent.length === 0 ? (
            <p className="empty-state"><i className="fas fa-inbox" aria-hidden="true" />No hay solicitudes registradas</p>
          ) : (
            <RecentTable rows={recent} onOpen={openDetail} />
          )}
        </div>
      </div>

      {user.rol === 'Administrador' && (
        <div id="adminWidgets" className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="ui-card p-5">
            <h6 className="section-title !mb-3"><i className="fas fa-history" aria-hidden="true" />Actividad Reciente</h6>
            {/* Cambio vs legacy: el log era solo localStorage del navegador (DataManager.logs, nunca persistido en backend);
                al eliminar los datos de negocio de localStorage no hay fuente → se muestra el estado vacío del original. */}
            <div id="actividadReciente" className="max-h-80 overflow-y-auto pr-2">
              <p className="text-slate-500 text-sm">No hay actividad reciente</p>
            </div>
          </div>
          <div className="ui-card p-5">
            <h6 className="section-title !mb-3"><i className="fas fa-exclamation-triangle" aria-hidden="true" />Alertas del Sistema</h6>
            <div id="alertasSistema" className="max-h-80 overflow-y-auto pr-2">
              <p className="text-sm text-slate-700 flex items-center gap-2"><i className="fas fa-check-circle text-[var(--success)]" aria-hidden="true" />Sistema funcionando correctamente</p>
            </div>
          </div>
        </div>
      )}
      {detailModal}
    </section>
  );
}
