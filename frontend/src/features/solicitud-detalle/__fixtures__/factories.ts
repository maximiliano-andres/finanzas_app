/** Fábricas de datos para tests de los listados. */
import { mapRecepcionado, mapSolicitud, type Recepcionado, type Solicitud } from '@/lib/solicitud';
import type { CurrentUser, SolicitudApi } from '@/types/domain';

let seq = 1;
export function api(p: Partial<SolicitudApi> = {}): SolicitudApi {
  return { id: seq++, solicitante: 'Ana Perez', empresa: 'ACME SA', proceso: 'PROC', monto: 1000, estado: 'ESPERANDO', usuario_id: 1, ...p };
}
export const sol = (p: Partial<SolicitudApi> = {}): Solicitud => mapSolicitud(api(p));
export const rec = (p: Partial<SolicitudApi> = {}): Recepcionado => mapRecepcionado(api({ estado: 'RECEPCIONADO', ...p }));
export function user(p: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1, email: 'a@x.cl', nombre: 'Ana Perez', primer_nombre: 'Ana', segundo_nombre: '', primer_apellido: 'Perez', segundo_apellido: '',
    rol: 'Solicitante', rol_id: 2, rut: '', cargo: '', ...p,
  };
}
