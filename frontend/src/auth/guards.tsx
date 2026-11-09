import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { ConnectionError } from '@/components/feedback/ConnectionError';
import { PageLoader } from '@/components/ui/Spinner';
import type { SectionKey } from '@/lib/roles';

/** Rutas del dashboard: requiere sesión completa (contraseña cambiada + 2FA verificado). */
export function RequireAuth() {
  const { state } = useAuth();
  const loc = useLocation();
  if (state.status === 'loading') return <PageLoader text="Verificando sesión..." />;
  if (state.status === 'error') return <ConnectionError message={state.message} />;
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (state.status === 'pending') return <Navigate to={state.step === 'force-change' ? '/force-change' : '/mfa'} replace />;
  return <Outlet />;
}

/** Sección visible según rol (equivalente a setupMenuByRole). Antes era solo cosmético: navigateTo no lo verificaba. */
export function RequireSection({ section, children }: { section: SectionKey; children: React.ReactNode }) {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;
  if (!state.sections.has(section)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
