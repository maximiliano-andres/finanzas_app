import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/endpoints';
import { ApiError, setSecurityRedirectHandler, setUnauthorizedHandler } from '@/api/client';
import { toCurrentUser, visibleSections, type SectionKey } from '@/lib/roles';
import type { CurrentUser } from '@/types/domain';

/**
 * Sesión basada SOLO en la cookie httpOnly `access_token` (emitida por el backend).
 * Mejora de seguridad: React no guarda el JWT en sessionStorage ni lo decodifica (antes: FLUJOPAGO_TOKEN).
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error'; message: string }
  | { status: 'pending'; step: 'force-change' | 'mfa' }
  | { status: 'authenticated'; user: CurrentUser; sections: Set<SectionKey> };

interface AuthApi {
  state: SessionState;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);
export const SESSION_KEY = ['session'] as const;

async function loadSession(): Promise<SessionState> {
  try {
    const s = await authApi.session();
    const user = toCurrentUser(s);
    return { status: 'authenticated', user, sections: visibleSections(user) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 403 && e.redirectTo) {
      return { status: 'pending', step: e.redirectTo.includes('password') ? 'force-change' : 'mfa' };
    }
    if (e instanceof ApiError && e.status === 401) return { status: 'anonymous' };
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: SESSION_KEY, queryFn: loadSession, staleTime: Infinity, retry: 1, retryDelay: 800 });
  const handling = useRef(false);

  const clearAll = useCallback(() => {
    qc.clear(); // elimina datos de negocio en memoria (el original los dejaba en localStorage tras logout)
    qc.setQueryData(SESSION_KEY, { status: 'anonymous' } satisfies SessionState);
  }, [qc]);

  // 401 global: sesión expirada → login con aviso (equivalente a ?error=session_expired del backend).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (handling.current) return;
      handling.current = true;
      clearAll();
      navigate('/login?error=session_expired', { replace: true });
      setTimeout(() => { handling.current = false; }, 1000);
    });
    setSecurityRedirectHandler((err) => {
      const step = err.redirectTo?.includes('password') ? 'force-change' : 'mfa';
      qc.setQueryData(SESSION_KEY, { status: 'pending', step } satisfies SessionState);
      navigate(step === 'force-change' ? '/force-change' : '/mfa', { replace: true });
    });
    return () => { setUnauthorizedHandler(null); setSecurityRedirectHandler(null); };
  }, [clearAll, navigate, qc]);

  // Expiración del JWT en cliente (antes solo se verificaba al cargar la página).
  const exp = query.data?.status === 'authenticated' ? query.data.user.exp : undefined;
  useEffect(() => {
    if (!exp) return;
    const ms = exp * 1000 - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => { clearAll(); navigate('/login?error=session_expired', { replace: true }); }, Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [exp, clearAll, navigate]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Aun si falla la red, se limpia el estado local (el original dejaba la sesión cargada).
    }
    clearAll();
    navigate('/login', { replace: true });
  }, [clearAll, navigate]);

  const value = useMemo<AuthApi>(() => ({
    // Servidor caído / error 5xx: NO se trata como "sin sesión" (no se envía al login por error de red).
    state: query.data ?? (query.isError
      ? { status: 'error', message: query.error instanceof ApiError ? query.error.message : 'No se pudo conectar con el servidor.' }
      : { status: 'loading' }),
    refresh: () => qc.invalidateQueries({ queryKey: SESSION_KEY }),
    logout,
  }), [query.data, query.isError, query.error, qc, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/** Usuario autenticado (solo usar dentro de rutas protegidas). */
export function useCurrentUser(): CurrentUser {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useCurrentUser fuera de sesión autenticada');
  return state.user;
}
