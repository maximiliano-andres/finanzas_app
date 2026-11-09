/** Reglas puras del modal "Detalle de Solicitud" (app.js verDetalleSolicitud 2084-2398). */
import type { Recepcionado, Solicitud } from '@/lib/solicitud';
import type { SolicitudApi } from '@/types/domain';

/** Vista normalizada que usa el modal para ambos orígenes (app.js:2001-2020). */
export type DetailView = SolicitudApi & {
  solicitanteNombre: string;
  empresaNombre: string;
  procesoNombre: string;
  fechaProceso?: string | null;
  fechaPago?: string | null;
  mesProceso?: string | null;
  unidadDeNegocio?: string | null;
  cuentaContable?: string | null;
  obraNombre?: string | null;
  estado: string;
  tipo_solicitud?: string | null;
};

export function toDetailView(s: Solicitud | Recepcionado, isRecepcionado: boolean): DetailView {
  if (isRecepcionado) {
    const r = s as Recepcionado;
    return {
      ...r,
      solicitanteNombre: r.solicitante,
      empresaNombre: r.empresa,
      procesoNombre: r.proceso,
      fechaProceso: r.fechaSolicitud,
      obraNombre: r.obra,
      estado: r.estado ?? '',
    };
  }
  const x = s as Solicitud;
  // En el original `obraNombre` no existe en solicitudes normalizadas (queda undefined).
  return { ...x, obraNombre: undefined };
}

const up = (v: string | null | undefined) => (v || '').toUpperCase();

/** Botón "Editar y Reenviar"/"Modificar Solicitud" (app.js:2369). */
export function canEditSolicitud(v: Pick<DetailView, 'modificacion_solicitud' | 'estado' | 'tipo_solicitud'>): boolean {
  return v.modificacion_solicitud === true || v.estado === 'Rechazado' ||
    (v.tipo_solicitud === 'Recepcionado' && (up(v.estado) === 'PENDIENTE' || up(v.estado) === 'ESPERANDO'));
}

export function editLabel(v: Pick<DetailView, 'modificacion_solicitud' | 'estado'>): string {
  return v.modificacion_solicitud === true || v.estado === 'Rechazado' ? 'Editar y Reenviar' : 'Modificar Solicitud';
}

/** Botón "Eliminar Solicitud" (app.js:2379). */
export function canDeleteSolicitud(v: Pick<DetailView, 'estado'>): boolean {
  return up(v.estado) === 'PENDIENTE' || up(v.estado) === 'ESPERANDO';
}

/** Glosa con fallback `proceso auxiliar mes` (app.js:2141). */
export function glosaOf(v: Pick<DetailView, 'glosa' | 'procesoNombre' | 'auxiliar' | 'mesProceso'>): string {
  return v.glosa || `${v.procesoNombre ?? ''} ${v.auxiliar ?? ''} ${v.mesProceso ?? ''}`.trim();
}

/** "Unidad / Obra" muestra el código auxiliar (= auxiliar de la obra seleccionada) o, si no hay, la obra (app.js:2151). */
export function unidadObraOf(v: Pick<DetailView, 'auxiliar' | 'obraNombre'>): string {
  return v.auxiliar || v.obraNombre || '-';
}

/** Monto por folio: `$` + toLocaleString es-CL, o `$0` (app.js:2189). */
export function formatFolioMonto(m: number | string | null | undefined): string {
  return `$${m ? Number(m).toLocaleString('es-CL') : 0}`;
}

export function fileName(path: string | null | undefined): string {
  return path ? path.split('/').pop() || path : '';
}
