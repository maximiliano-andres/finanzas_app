/**
 * Hooks de datos compartidos (TanStack Query).
 * Sustituyen DataManager + localStorage: caché en memoria (se descarta al cerrar sesión),
 * deduplicación de solicitudes simultáneas e invalidación tras mutaciones.
 */
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogosApi, historicoApi, recepcionadoApi, solicitudesApi, usuariosApi } from './endpoints';
import { mapHistorico, mapRecepcionado, mapSolicitud } from '@/lib/solicitud';

export const qk = {
  solicitudes: ['solicitudes'] as const,
  recepcionado: ['recepcionado'] as const,
  historico: ['historico'] as const,
  empresas: ['empresas'] as const,
  procesos: ['procesos'] as const,
  procesosAuxiliares: ['procesosAuxiliares'] as const,
  usuarios: ['usuarios'] as const,
  roles: ['roles'] as const,
  devices: ['devices'] as const,
};

export const solicitudesQuery = queryOptions({ queryKey: qk.solicitudes, queryFn: async () => (await solicitudesApi.list()).map(mapSolicitud) });
export const useSolicitudes = () => useQuery(solicitudesQuery);
export const useRecepcionado = () =>
  useQuery({ queryKey: qk.recepcionado, queryFn: async () => (await recepcionadoApi.list()).map(mapRecepcionado) });
export const useHistorico = () =>
  useQuery({ queryKey: qk.historico, queryFn: async () => (await historicoApi.list()).map(mapHistorico) });
export const useEmpresas = () => useQuery({ queryKey: qk.empresas, queryFn: catalogosApi.empresas, staleTime: 5 * 60_000 });
export const useProcesos = () => useQuery({ queryKey: qk.procesos, queryFn: catalogosApi.procesos, staleTime: 5 * 60_000 });
export const useProcesosAuxiliares = () =>
  useQuery({ queryKey: qk.procesosAuxiliares, queryFn: catalogosApi.procesosAuxiliares, staleTime: 5 * 60_000 });
export const useUsuarios = (enabled = true) => useQuery({ queryKey: qk.usuarios, queryFn: usuariosApi.list, enabled });
export const useRoles = () => useQuery({ queryKey: qk.roles, queryFn: catalogosApi.roles, staleTime: 10 * 60_000 });

/** Invalida (y re-descarga una sola vez) los datasets afectados por una mutación. */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: ReadonlyArray<readonly string[]>) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}
