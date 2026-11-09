import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useCurrentUser } from '@/auth/AuthProvider';
import { solicitudesQuery } from '@/api/queries';
import { SECTIONS } from '@/app/sections';
import { BrandLockup } from '@/components/ui/BrandMark';
import { APP_NAME, pageTitle } from '@/config/brand';

const DESKTOP = '(min-width: 1024px)';
const STORAGE_KEY = 'sidebarCollapsed';

function readCollapsed(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

function initials(first?: string | null, last?: string | null): string {
  return `${(first || '').trim().charAt(0)}${(last || '').trim().charAt(0)}`.toUpperCase() || '?';
}

/**
 * Layout del dashboard (sidebar + barra superior + main). Comportamiento conservado:
 * - Desktop: sidebar fijo colapsable 17rem ↔ 4.75rem (persistido en localStorage.sidebarCollapsed).
 * - <1024px: sidebar off-canvas con overlay y bloqueo de scroll; la barra superior se oculta al hacer scroll hacia abajo.
 * - La navegación cierra el menú móvil; listeners con cleanup.
 * Rediseño 2026: sidebar oscuro de altura completa con identidad; barra superior clara que indica la sección actual.
 */
export function DashboardLayout() {
  const user = useCurrentUser();
  const { state, logout } = useAuth();
  const sections = state.status === 'authenticated' ? state.sections : new Set();
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP).matches);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const location = useLocation();
  const lastScroll = useRef(0);

  useEffect(() => { document.title = pageTitle('Dashboard'); }, []);

  // Rendimiento: las solicitudes las usan casi todas las secciones. Se precargan en paralelo con el chunk
  // lazy de la sección (evita la cascada chunk → montaje (+throttle de Suspense ~300ms) → fetch).
  const qc = useQueryClient();
  useEffect(() => { void qc.prefetchQuery(solicitudesQuery); }, [qc]);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const onChange = () => { setIsDesktop(mq.matches); if (mq.matches) setMobileOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Cerrar menú móvil al navegar (ajuste de estado durante el render, patrón recomendado por React en vez de un efecto).
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMobileOpen(false);
  }
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);

  // Bloqueo de scroll del body con menú móvil abierto.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('sidebar-open');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.body.classList.remove('sidebar-open'); document.removeEventListener('keydown', onKey); };
  }, [mobileOpen]);

  // Barra superior auto-oculta en <1024 (dashboard_navbar.js): debounce 50ms, umbral 100px y delta 10px.
  useEffect(() => {
    if (isDesktop) return; // en desktop siempre visible (ver `navVisibleHidden`)
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const y = window.scrollY;
        if (Math.abs(y - lastScroll.current) < 10) return;
        setNavHidden(y > lastScroll.current && y > 100);
        lastScroll.current = y;
      }, 50);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(t); };
  }, [isDesktop]);

  const toggleDesktop = useCallback(() => {
    setCollapsed((c) => {
      try { localStorage.setItem(STORAGE_KEY, String(!c)); } catch { /* almacenamiento no disponible */ }
      return !c;
    });
  }, []);

  const isCollapsed = isDesktop && collapsed;
  const navVisibleHidden = !isDesktop && navHidden;
  const fullName = `${(user.primer_nombre || '').toUpperCase()} ${(user.primer_apellido || '').toUpperCase()}`.trim();
  const visibleSections = SECTIONS.filter((s) => sections.has(s.key));
  const current = SECTIONS.find((s) => (s.path === '/' ? location.pathname === '/' : location.pathname === s.path || location.pathname.startsWith(`${s.path}/`)));
  const offset = isCollapsed ? 'lg:left-[var(--sidebar-w-collapsed)]' : 'lg:left-[var(--sidebar-w)]';

  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      <a href="#mainContent" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[3000] focus:bg-white focus:px-3 focus:py-2 focus:rounded-md focus:shadow-md">
        Saltar al contenido
      </a>

      {/* Barra superior: ¿dónde estoy? + identidad del usuario + salir */}
      <nav id="mainNavbar" aria-label="Barra superior"
        className={`fixed top-0 right-0 left-0 ${offset} z-40 h-[var(--nav-height)] bg-white/90 backdrop-blur-md border-b border-[var(--border)] transition-[transform,left] duration-200 ease-out`}
        style={{ transform: navVisibleHidden ? 'translateY(-100%)' : 'translateY(0)' }}>
        <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button id="sidebarToggle" type="button" onClick={() => setMobileOpen((o) => !o)} aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="sidebar"
              className="ui-icon-btn lg:hidden !w-10 !h-10 border !border-[var(--border)] text-slate-700">
              <i className="fas fa-bars" aria-hidden="true" />
            </button>
            <BrandLockup size="sm" className="lg:hidden" iconOnly />
            <div className="hidden sm:flex items-center gap-2 min-w-0 text-sm" aria-label="Ubicación actual">
              <span className="hidden lg:inline text-slate-500">{APP_NAME}</span>
              {current && (
                <>
                  <i className="hidden lg:inline fas fa-chevron-right text-[0.6875rem] text-slate-400" aria-hidden="true" />
                  <span className="font-semibold text-slate-800 truncate" aria-current="page">{current.label}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="hidden md:flex items-center gap-3 min-w-0 pl-1 pr-3 py-1 rounded-full border border-[var(--border)] bg-white">
              <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-white text-xs font-semibold flex items-center justify-center" aria-hidden="true">
                {initials(user.primer_nombre, user.primer_apellido)}
              </span>
              <div className="flex flex-col min-w-0 leading-tight">
                <span id="currentUserName" title={fullName} className="text-[0.8125rem] font-semibold text-slate-800 truncate max-w-[14rem]">{fullName}</span>
                <span className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                  <span className="sr-only">Rol:</span>
                  <span id="currentUserRole" className="truncate">{user.rol}</span>
                  <span className="hidden xl:inline text-slate-300" aria-hidden="true">·</span>
                  <span className="sr-only">Cargo:</span>
                  <span id="currentUserCargo" className="hidden xl:inline truncate max-w-[11.25rem]">{user.cargo || 'Sin cargo'}</span>
                </span>
              </div>
            </div>
            <div className="md:hidden flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-white text-xs font-semibold flex items-center justify-center" aria-hidden="true">
                {initials(user.primer_nombre, user.primer_apellido)}
              </span>
              <span id="currentUserNameMobile" title={fullName} className="hidden min-[400px]:inline text-xs font-semibold text-slate-700 truncate max-w-[clamp(6rem,28vw,14rem)]">{fullName}</span>
            </div>
            <button type="button" onClick={() => void logout()} data-testid="logout"
              className="ui-btn ui-btn-secondary ui-btn-sm !min-h-[2.25rem] hover:!border-red-200 hover:!text-red-700 hover:!bg-red-50"
              title="Cerrar sesión">
              <i className="fas fa-arrow-right-from-bracket" aria-hidden="true" />
              <span className="hidden sm:inline">Salir</span>
              <span className="sr-only sm:hidden">Salir</span>
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && !isDesktop && (
        <div id="sidebarOverlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px] z-50 animate-fadeIn" aria-hidden="true" />
      )}

      {/* Navegación principal */}
      <aside id="sidebar" aria-label="Menú principal"
        className={`${isCollapsed ? 'w-[var(--sidebar-w-collapsed)]' : 'w-[18rem] lg:w-[var(--sidebar-w)]'} fixed top-0 left-0 h-[100dvh] z-[60] lg:z-50 flex flex-col bg-[var(--nav-bg)] text-[var(--nav-text)] border-r border-white/5 transition-[transform,width] duration-200 ease-out lg:translate-x-0 ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className={`h-[var(--nav-height)] shrink-0 flex items-center gap-3 border-b border-[var(--nav-border)] ${isCollapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
          <BrandLockup size="md" tone="dark" iconOnly={isCollapsed} />
          <button type="button" onClick={() => setMobileOpen(false)} className="lg:hidden ui-icon-btn !text-[var(--nav-text)] hover:!bg-white/10 hover:!text-white" aria-label="Cerrar menú">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3" aria-labelledby="sidebarTitle">
          <h3 id="sidebarTitle" className={isCollapsed ? 'sr-only' : 'px-3 mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--nav-text)] opacity-70'}>Menú</h3>
          <ul className="space-y-0.5">
            {visibleSections.map((s) => (
              <li key={s.key}>
                <NavLink to={s.path} end={s.path === '/'} id={s.menuId} title={isCollapsed ? s.label : undefined}
                  className={({ isActive }) => `nav-item group relative flex items-center gap-3 rounded-lg text-sm min-h-[2.5rem] transition-colors duration-150 ${isCollapsed ? 'justify-center px-0' : 'px-3'} ${isActive
                    ? 'active bg-[var(--nav-item-active)] text-white font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-[#A0B1C2]'
                    : 'text-[var(--nav-text)] hover:bg-[var(--nav-item-hover)] hover:text-white font-medium'}`}>
                  <i className={`fas ${s.icon} w-5 text-center text-[0.9375rem] shrink-0 opacity-90`} aria-hidden="true" />
                  <span className={isCollapsed ? 'sr-only' : 'truncate'}>{s.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={`hidden lg:flex shrink-0 border-t border-[var(--nav-border)] p-3 ${isCollapsed ? 'justify-center' : 'justify-end'}`}>
          <button type="button" onClick={toggleDesktop} aria-label={isCollapsed ? 'Expandir menú' : 'Contraer menú'} aria-expanded={!isCollapsed}
            title={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
            className="ui-icon-btn !text-[var(--nav-text)] hover:!bg-white/10 hover:!text-white">
            <i id="sidebarToggleIcon" className="fas fa-angles-left transition-transform duration-200" style={{ transform: isCollapsed ? 'rotate(180deg)' : undefined }} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main id="mainContent" tabIndex={-1}
        className={`min-w-0 pt-[var(--nav-height)] ${isCollapsed ? 'lg:pl-[var(--sidebar-w-collapsed)]' : 'lg:pl-[var(--sidebar-w)]'} transition-[padding] duration-200 ease-out focus:outline-none`}>
        <div className="mx-auto w-full max-w-[160rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
