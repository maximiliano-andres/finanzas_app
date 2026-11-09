import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { APP_BASENAME } from '@/config/constants';
import { RequireAuth, RequireSection } from '@/auth/guards';
import { useAuth } from '@/auth/AuthProvider';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageLoader } from '@/components/ui/Spinner';
import { ConnectionError } from '@/components/feedback/ConnectionError';
import { AppProviders } from './providers';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import LoginPage from '@/features/auth/LoginPage';
import type { SectionKey } from '@/lib/roles';

// Code splitting por sección con `lazy` de React Router: el módulo se descarga ANTES de renderizar
// (en paralelo con la verificación de sesión) → sin fallback de Suspense ni su "throttle" de ~300 ms.
type PageModule = { default: React.ComponentType<Record<string, unknown>> };
const sectionRoute = (key: SectionKey, load: () => Promise<PageModule>, props: Record<string, unknown> = {}) => ({
  lazy: async () => {
    const Page = (await load()).default;
    return { Component: () => <RequireSection section={key}><Page {...props} /></RequireSection> };
  },
});
const ForceChangePage = lazy(() => import('@/features/auth/ForceChangePage'));
const MfaPage = lazy(() => import('@/features/auth/MfaPage'));
const NotFoundPage = lazy(() => import('@/features/errors/NotFoundPage'));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

/** Páginas de login/2FA: redirige según el estado real de la sesión. */
function AuthStep({ step, children }: { step: 'login' | 'force-change' | 'mfa'; children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <PageLoader text="Verificando sesión..." />;
  if (state.status === 'error' && step !== 'login') return <ConnectionError message={state.message} />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  if (step !== 'login' && state.status === 'anonymous') return <Navigate to="/login" replace />;
  if (step === 'mfa' && state.status === 'pending' && state.step === 'force-change') return <Navigate to="/force-change" replace />;
  if (step === 'force-change' && state.status === 'pending' && state.step === 'mfa') return <Navigate to="/mfa" replace />;
  if (step === 'login' && state.status === 'pending') return <Navigate to={state.step === 'mfa' ? '/mfa' : '/force-change'} replace />;
  return <S>{children}</S>;
}

export const router = createBrowserRouter(
  [
    {
      element: <AppProviders><Outlet /></AppProviders>,
      errorElement: <RouteErrorBoundary />,
      children: [
        { path: '/login', element: <AuthStep step="login"><LoginPage /></AuthStep> },
        { path: '/force-change', element: <AuthStep step="force-change"><ForceChangePage /></AuthStep> },
        { path: '/mfa', element: <AuthStep step="mfa"><MfaPage /></AuthStep> },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <DashboardLayout />,
              errorElement: <RouteErrorBoundary />,
              children: [
                { index: true, ...sectionRoute('dashboard', () => import('@/features/dashboard/DashboardPage') as Promise<PageModule>) },
                { path: 'nueva-solicitud', ...sectionRoute('nuevaSolicitud', () => import('@/features/nueva-solicitud/NuevaSolicitudPage') as Promise<PageModule>) },
                { path: 'mis-solicitudes', ...sectionRoute('misSolicitudes', () => import('@/features/mis-solicitudes/MisSolicitudesPage') as Promise<PageModule>) },
                { path: 'aprobaciones', ...sectionRoute('aprobaciones', () => import('@/features/aprobaciones/AprobacionesPage') as Promise<PageModule>, { level: 1 }) },
                { path: 'aprobaciones2', ...sectionRoute('aprobaciones2', () => import('@/features/aprobaciones/AprobacionesPage') as Promise<PageModule>, { level: 2 }) },
                { path: 'finanzas', ...sectionRoute('finanzas', () => import('@/features/finanzas/FinanzasPage') as Promise<PageModule>) },
                { path: 'todas-solicitudes', ...sectionRoute('todasSolicitudes', () => import('@/features/todas-solicitudes/TodasSolicitudesPage') as Promise<PageModule>) },
                { path: 'recepcionado', ...sectionRoute('recepcionado', () => import('@/features/recepcionado/RecepcionadoPage') as Promise<PageModule>) },
                { path: 'reportes', ...sectionRoute('reportes', () => import('@/features/reportes/ReportesPage') as Promise<PageModule>) },
                { path: 'administracion', ...sectionRoute('administracion', () => import('@/features/administracion/AdministracionPage') as Promise<PageModule>) },
                { path: 'seguridad', ...sectionRoute('seguridad', () => import('@/features/seguridad/SeguridadPage') as Promise<PageModule>) },
              ],
            },
          ],
        },
        { path: '*', element: <S><NotFoundPage /></S> },
      ],
    },
  ],
  { basename: APP_BASENAME },
);
