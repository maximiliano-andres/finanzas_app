import { useState } from 'react';
import EmpresasTab from './EmpresasTab';
import ProcesosAuxiliaresTab from './ProcesosAuxiliaresTab';
import ProcesosTab from './ProcesosTab';
import UsuariosTab from './UsuariosTab';

type TabKey = 'empresas' | 'obras' | 'procesos' | 'usuarios';
const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'empresas', label: 'Empresas', icon: 'fa-building' },
  { key: 'obras', label: 'Procesos Auxiliares', icon: 'fa-hard-hat' },
  { key: 'procesos', label: 'Procesos', icon: 'fa-cogs' },
  { key: 'usuarios', label: 'Usuarios', icon: 'fa-users' },
];

/** Sección Administración (admin.js loadAdministracion / switchTab). */
export default function AdministracionPage() {
  const [tab, setTab] = useState<TabKey>('empresas');
  return (
    <section id="sectionAdministracion" className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-cog" aria-hidden="true" />Administración</h2>
          <p className="page-subtitle">Gestiona empresas, procesos y usuarios del sistema.</p>
        </div>
      </header>
      <div id="adminTabsContainer">
        <div className="ui-card p-4 sm:p-6">
          <div role="tablist" aria-label="Administración" className="border-b border-[var(--border)] flex flex-wrap gap-x-1 mb-5">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} aria-controls="adminContent"
                data-testid={`admin-tab-${t.key}`} onClick={() => setTab(t.key)}
                className={`tab-button px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-primary text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'} transition-colors flex items-center gap-2 shrink-0`}>
                <i className={`fas ${t.icon} ${tab === t.key ? 'text-primary' : 'text-slate-400'}`} aria-hidden="true" />{t.label}
              </button>
            ))}
          </div>
          <div id="adminContent" role="tabpanel">
            {tab === 'empresas' && <EmpresasTab />}
            {tab === 'obras' && <ProcesosAuxiliaresTab />}
            {tab === 'procesos' && <ProcesosTab />}
            {tab === 'usuarios' && <UsuariosTab />}
          </div>
        </div>
      </div>
    </section>
  );
}
