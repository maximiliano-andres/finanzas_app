/** Tipos del dominio FlujoPago (contrato del backend sin cambios). */
export type EstadoSolicitudApi =
  | 'RECHAZADO' | 'ESPERANDO' | 'PENDIENTE' | 'APROBADO NIVEL 1' | 'APROBADO NIVEL 2'
  | 'APROBADO FINANZAS' | 'RECEPCIONADO' | 'PAGADO';

export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'] as const;
export type Mes = (typeof MESES)[number];

export const FORMAS_PAGO = ['DEPOSITO', 'VALE VISTA', 'DEPOSITO Y VALE VISTA', 'DEVOLUCION - VALE VISTA', 'DEVOLUCION - DEPOSITO'] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export const FOLIO_SUFFIXES = ['uno', 'dos', 'tres', 'cuatro', 'cinco'] as const;
export type FolioSuffix = (typeof FOLIO_SUFFIXES)[number];

type FolioFields = {
  [K in FolioSuffix as `folio_${K}`]?: string | null;
} & {
  [K in FolioSuffix as `monto_por_folio_${K}`]?: number | null;
} & {
  [K in FolioSuffix as `pdf_folio_${K}`]?: string | null;
} & {
  [K in FolioSuffix as `forma_pago_folio_${K}`]?: FormaPago | string | null;
};

/** Registro crudo de /todas_solicitudes, /recepcionado y /historico. */
export type SolicitudApi = FolioFields & {
  id: number;
  usuario_id?: number | string | null;
  solicitante: string;
  fecha_solicitud?: string | null;
  fecha_emision?: string | null;
  folio?: string | null;
  empresa: string;
  obra?: string | null;
  proceso: string;
  monto: number;
  estado?: EstadoSolicitudApi | string | null;
  reviso?: string | null;
  fecha_aprobacion?: string | null;
  fecha_registro_historico?: string | null;
  id_solicitud_origen?: number | null;
  mes_de_proceso?: Mes | string | null;
  anio?: number | null;
  cuenta_contable?: string | null;
  auxiliar?: string | null;
  fecha_de_pago?: string | null;
  unidad_de_negocio?: string | null;
  glosa?: string | null;
  observaciones?: string | null;
  observaciones_devolucion?: string | null;
  modificacion_solicitud?: boolean | null;
  pdf?: string | null;
  pdf_firmado?: string | null;
  pdf_registro_autorizacion?: string | null;
  tipo_solicitud?: string | null;
  historial?: unknown[];
};

export interface EmpresaApi { id: number; empresa: string; codigo: string }
export interface ProcesoAuxiliarApi { id: number; numero: string; detalle: string; auxiliar: string; estado: string }
export interface ProcesoApi { id: number; nombre: string; proceso: string; cuenta_objeto: string; auxiliar: string; estado: string }
export interface RolApi { id: number; nombre: string }
export interface UsuarioApi {
  id: number; cargo: string; nombre_1: string; nombres_2?: string | null; apellido_1: string; apellido_2?: string | null;
  email: string; rol_id: number; rut: string; created_at?: string; rol_nombre?: string; obras_ids?: number[];
}

/** Usuario de la sesión (GET /session — claims públicos del JWT). */
export interface SessionUser {
  sub: string;
  email: string;
  primer_nombre?: string | null;
  segundo_nombre?: string | null;
  primer_apellido?: string | null;
  segundo_apellido?: string | null;
  rol_id?: number | null;
  rol_nombre?: string | null;
  rut?: string | null;
  cargo?: string | null;
  exp?: number;
}

/** Equivalente a `currentUser` del frontend original (app.js:248-262). */
export interface CurrentUser {
  id: number;
  email: string;
  nombre: string;
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  rol: string;
  rol_id: number | null;
  rut: string;
  cargo: string;
  exp?: number;
}
