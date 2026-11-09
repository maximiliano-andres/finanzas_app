/**
 * Catálogo ÚNICO de endpoints del backend (contrato sin cambios).
 * Ninguna feature debe llamar a fetch directamente: todo pasa por aquí → api/client.ts.
 */
import { api, request, requestEnvelope } from './client';
import type {
  EmpresaApi, ProcesoApi, ProcesoAuxiliarApi, RolApi, SessionUser, SolicitudApi, UsuarioApi,
} from '@/types/domain';

type Json = Record<string, unknown>;

// ---------- Auth / sesión ----------
export const authApi = {
  login: (body: { email: string; password: string; remember_device: boolean }) =>
    api.post<{ access_token: string; token_type: string }>('/login', body, { skipGlobalHandlers: true }),
  logout: () => request('/logout', { method: 'POST', skipGlobalHandlers: true, raw: true }),
  session: () => api.get<SessionUser>('/session', { skipGlobalHandlers: true }),
  forceChange: (body: { old_password: string; new_password: string; confirm_password: string }) =>
    api.post<null>('/password/force-change', body, { skipGlobalHandlers: true }),
};

// ---------- MFA / Seguridad ----------
export interface MfaStatus { mfa_enabled: boolean; mfa_verified_at: string | null; must_change_password: boolean }
export interface MfaSetup { qr_code_base64: string; backup_codes: string[]; provisioning_uri: string }
export interface TrustedDevice { id: number; device_name: string | null; created_at: string | null; expires_at: string | null; last_used_at: string | null }

export const mfaApi = {
  status: () => api.get<MfaStatus>('/mfa/status', { skipGlobalHandlers: true }),
  setup: () => api.post<MfaSetup>('/mfa/setup', undefined, { skipGlobalHandlers: true }),
  verifySetup: (code: string) => api.post<Json>('/mfa/verify-setup', { code }, { skipGlobalHandlers: true }),
  verify: (code: string) => api.post<Json>('/mfa/verify', { code }, { skipGlobalHandlers: true }),
  verifyBackup: (backup_code: string) => api.post<Json>('/mfa/verify-backup', { backup_code }, { skipGlobalHandlers: true }),
  /** Devuelve el sobre completo: el mensaje de éxito incluye el correo enmascarado. */
  sendEmailOtp: () => requestEnvelope('/mfa/send-email-otp', { method: 'POST', skipGlobalHandlers: true }),
  devices: () => api.get<TrustedDevice[]>('/mfa/devices'),
  revokeDevice: (id: number) => api.delete<Json>(`/mfa/devices/${id}`),
};

// ---------- Catálogos ----------
export const catalogosApi = {
  empresas: () => api.get<EmpresaApi[]>('/empresas'),
  createEmpresa: (b: { empresa: string; codigo: string }) => api.post<EmpresaApi>('/empresas', b),
  updateEmpresa: (id: number, b: { empresa: string; codigo: string }) => api.put<EmpresaApi>(`/empresas/${id}`, b),
  deleteEmpresa: (id: number) => api.delete<EmpresaApi>(`/empresas/${id}`),

  procesosAuxiliares: () => api.get<ProcesoAuxiliarApi[]>('/procesos_auxiliares'),
  createProcesoAuxiliar: (b: Omit<ProcesoAuxiliarApi, 'id'>) => api.post<ProcesoAuxiliarApi>('/procesos_auxiliares', b),
  updateProcesoAuxiliar: (id: number, b: Omit<ProcesoAuxiliarApi, 'id'>) => api.put<ProcesoAuxiliarApi>(`/procesos_auxiliares/${id}`, b),
  deleteProcesoAuxiliar: (id: number) => api.delete<ProcesoAuxiliarApi>(`/procesos_auxiliares/${id}`),

  procesos: () => api.get<ProcesoApi[]>('/procesos'),
  createProceso: (b: Omit<ProcesoApi, 'id'>) => api.post<ProcesoApi>('/procesos', b),
  updateProceso: (id: number, b: Omit<ProcesoApi, 'id'>) => api.put<ProcesoApi>(`/procesos/${id}`, b),
  deleteProceso: (id: number) => api.delete<ProcesoApi>(`/procesos/${id}`),

  roles: () => api.get<RolApi[]>('/roles'),
};

// ---------- Usuarios ----------
export const usuariosApi = {
  list: () => api.get<UsuarioApi[]>('/usuarios'),
  create: (b: Json) => api.post<Json>('/usuarios', b),
  update: (id: number, b: Json) => api.put<UsuarioApi>(`/usuarios/${id}`, b),
  remove: (id: number) => api.delete<Json>(`/usuarios/${id}`),
  resetPassword: (id: number) => api.post<Json>(`/usuarios/${id}/reset-password`),
  sendTempPassword: (id: number, b: Json) => api.post<Json>(`/usuarios/${id}/send-temp-password`, b),
};

// ---------- Solicitudes ----------
export type PdfFieldName = `pdf_folio_${'uno' | 'dos' | 'tres' | 'cuatro' | 'cinco'}` | string;

export const solicitudesApi = {
  list: () => api.get<SolicitudApi[]>('/todas_solicitudes'),
  /** multipart (campos repetidos folio/montos_por_folio/forma_pago/pdfs). */
  create: (form: FormData) => api.post<Json>('/todas_solicitudes', form, { timeoutMs: 120_000 }),
  patch: (id: number, b: Json) => api.patch<SolicitudApi>(`/todas_solicitudes/${id}`, b),
  remove: (id: number, preserveFiles = false) =>
    api.delete<Json>(`/todas_solicitudes/${id}`, { query: preserveFiles ? { preserve_files: true } : undefined }),
  uploadPdf: (id: number, fieldName: PdfFieldName, file: File) => {
    const f = new FormData();
    f.append('field_name', fieldName);
    f.append('pdf', file);
    return api.post<Json>(`/todas_solicitudes/${id}/pdf`, f, { timeoutMs: 120_000 });
  },
  deletePdf: (id: number, fieldName: PdfFieldName, pdfPath: string) =>
    api.delete<Json>(`/todas_solicitudes/${id}/pdf`, { query: { field_name: fieldName, pdf_path: pdfPath } }),
};

// ---------- Recepcionado ----------
export const recepcionadoApi = {
  list: () => api.get<SolicitudApi[]>('/recepcionado'),
  create: (b: Json) => api.post<SolicitudApi>('/recepcionado', b),
  patch: (id: number, b: Json) => api.patch<SolicitudApi>(`/recepcionado/${id}`, b),
  guardarComoSolicitud: (id: number, b: Json) => api.post<Json>(`/recepcionado/${id}/guardar-como-solicitud`, b),
  reenviar: (id: number, b?: Json) => api.post<SolicitudApi>(`/recepcionado/${id}/reenviar`, b),
  uploadPdf: (id: number, fieldName: PdfFieldName, file: File) => {
    const f = new FormData();
    f.append('field_name', fieldName);
    f.append('pdf', file);
    return api.post<Json>(`/recepcionado/${id}/pdf`, f, { timeoutMs: 120_000 });
  },
  deletePdf: (id: number, fieldName: PdfFieldName, pdfPath: string) =>
    api.delete<Json>(`/recepcionado/${id}/pdf`, { query: { field_name: fieldName, pdf_path: pdfPath } }),
};

// ---------- Histórico ----------
export const historicoApi = {
  list: (query?: Record<string, string | number | undefined>) => api.get<SolicitudApi[]>('/historico', { query }),
};

// ---------- PDF firmado / registro autorización ----------
function idsForm(ids: number[], file: File) {
  const f = new FormData();
  f.append('ids', JSON.stringify(ids));
  f.append('pdf', file);
  return f;
}
export const pdfApi = {
  uploadFirmado: (ids: number[], file: File) => api.post<Json>('/pdf-firmado/upload', idsForm(ids, file), { timeoutMs: 120_000 }),
  deleteFirmado: (id: number) => api.delete<Json>(`/pdf-firmado/delete/${id}`),
  uploadRegistroAutorizacion: (ids: number[], file: File) =>
    api.post<Json>('/pdf-registro-autorizacion/upload', idsForm(ids, file), { timeoutMs: 120_000 }),
  deleteRegistroAutorizacion: (id: number) => api.delete<Json>(`/pdf-registro-autorizacion/delete/${id}`),
  /** Descarga protegida (doc_pdf/, PDF_firmados/, PDF_autorizaciones/) como Blob. */
  fetchBlob: async (path: string): Promise<Blob> => {
    const clean = path.replace(/^\/+/, '').replace(/^flujopago\/gestion-pagos\/v1\//, '');
    const res = await request<Response>(`/flujopago/gestion-pagos/v1/${clean}`, { raw: true, headers: { Accept: 'application/pdf' } });
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) throw new Error('Respuesta inválida al descargar el documento.');
    return res.blob();
  },
};
