import { API_PREFIX, DEFAULT_TIMEOUT_MS } from '@/config/constants';

/** Sobre estándar devuelto por el backend (response_wrapper.py). */
export interface ApiEnvelope<T = unknown> {
  status: 'success' | 'error';
  code: number;
  timestamp?: string;
  path?: string;
  method?: string;
  message?: string;
  data?: T;
  errors?: Array<{ loc?: unknown[]; msg?: string; type?: string; [k: string]: unknown }>;
  redirect_to?: string;
  detail?: unknown;
}

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse' | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly body?: ApiEnvelope;
  constructor(kind: ApiErrorKind, status: number, message: string, body?: ApiEnvelope) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
  get redirectTo(): string | undefined {
    return this.body?.redirect_to;
  }
}

/** Mensajes por defecto cuando el backend no envía uno utilizable. */
const DEFAULT_STATUS_MESSAGES: Record<number, string> = {
  400: 'Solicitud inválida. Revise los datos ingresados.',
  401: 'Su sesión ha expirado. Inicie sesión nuevamente.',
  403: 'No tiene permisos para realizar esta acción.',
  404: 'El recurso solicitado no existe.',
  409: 'Conflicto: el registro ya existe o fue modificado.',
  413: 'El archivo es demasiado grande.',
  422: 'Error de validación en los datos.',
  429: 'Demasiadas solicitudes. Intente nuevamente más tarde.',
  500: 'Error interno del servidor. Intente nuevamente más tarde.',
  502: 'El servidor no está disponible. Intente nuevamente más tarde.',
  503: 'El servidor no está disponible. Intente nuevamente más tarde.',
  504: 'El servidor tardó demasiado en responder.',
};

export function messageForStatus(status: number): string {
  return DEFAULT_STATUS_MESSAGES[status] ?? `Error inesperado (${status}).`;
}

/** Extrae un mensaje legible del cuerpo de error (message | detail string | detail[].msg). */
export function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.message === 'string' && b.message.trim()) return b.message;
    if (typeof b.detail === 'string' && b.detail.trim()) return b.detail;
    if (Array.isArray(b.detail) && b.detail.length) {
      const first = b.detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  }
  return messageForStatus(status);
}

type UnauthorizedHandler = (err: ApiError) => void;
let onUnauthorized: UnauthorizedHandler | null = null;
let onSecurityRedirect: UnauthorizedHandler | null = null;

/** Registra el manejador global de 401 (sesión expirada) — lo usa AuthProvider. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn;
}
/** Registra el manejador global de 403 con redirect_to (MFA / cambio de contraseña pendiente). */
export function setSecurityRedirectHandler(fn: UnauthorizedHandler | null) {
  onSecurityRedirect = fn;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Objeto JSON, FormData o undefined. */
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
  /** No disparar los manejadores globales (p. ej. en login). */
  skipGlobalHandlers?: boolean;
  /** Devuelve el Response crudo (descargas). */
  raw?: boolean;
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = path.startsWith('http') || path.startsWith('/') ? path : `${API_PREFIX}/${path}`;
  const url = base.startsWith('/flujopago') || base.startsWith('http') || base.startsWith('/public') ? base : `${API_PREFIX}${base}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

/**
 * Cliente HTTP único. Mismo contrato que el frontend original:
 * - Autenticación por cookie httpOnly `access_token` (credentials: 'same-origin').
 * - No se almacenan tokens en localStorage/sessionStorage.
 */
export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, query, timeoutMs = DEFAULT_TIMEOUT_MS, skipGlobalHandlers, raw, headers, signal, ...init } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const onAbort = () => controller.abort('aborted');
  signal?.addEventListener('abort', onAbort, { once: true });

  const h = new Headers(headers);
  if (!h.has('Accept')) h.set('Accept', 'application/json');
  let payload: BodyInit | undefined;
  if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
    payload = body as BodyInit;
  } else if (body !== undefined) {
    h.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      credentials: 'same-origin',
      ...init,
      headers: h,
      body: payload,
      signal: controller.signal,
    });
  } catch (e) {
    const reason = controller.signal.reason;
    if (reason === 'timeout') throw new ApiError('timeout', 0, 'La solicitud tardó demasiado. Verifique su conexión e intente nuevamente.');
    if (reason === 'aborted' || (e as Error)?.name === 'AbortError') throw new ApiError('aborted', 0, 'Solicitud cancelada.');
    throw new ApiError('network', 0, 'No se pudo conectar con el servidor. Verifique su conexión a internet.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (res.ok && raw) return res as unknown as T;

  const ct = res.headers.get('content-type') ?? '';
  let parsed: unknown = undefined;
  if (ct.includes('application/json')) {
    try {
      parsed = await res.json();
    } catch {
      if (res.ok) throw new ApiError('parse', res.status, 'Respuesta inválida del servidor.');
    }
  } else if (res.ok && res.redirected && ct.includes('text/html')) {
    // El backend redirige a HTML de login cuando la sesión expira en rutas no-API (ej. PDFs).
    const err = new ApiError('http', 401, messageForStatus(401));
    if (!skipGlobalHandlers) onUnauthorized?.(err);
    throw err;
  }

  if (!res.ok) {
    const envelope = (parsed ?? undefined) as ApiEnvelope | undefined;
    const err = new ApiError('http', res.status, extractMessage(parsed, res.status), envelope);
    if (!skipGlobalHandlers) {
      if (res.status === 401) onUnauthorized?.(err);
      else if (res.status === 403 && envelope?.redirect_to) onSecurityRedirect?.(err);
    }
    throw err;
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const env = parsed as ApiEnvelope<T>;
    // Varias rutas del backend (/mfa/*, /password/*) devuelven errores con HTTP 200 y status:"error" (sin `data`).
    if (env.status === 'error') throw new ApiError('http', env.code ?? res.status, extractMessage(env, env.code ?? res.status), env);
    if (env.status === 'success' && 'data' in env) return env.data as T;
  }
  return parsed as T;
}

/** Variante que devuelve el sobre completo (cuando la UI necesita `message`). */
export async function requestEnvelope<T = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const res = await request<Response>(path, { ...opts, raw: true });
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return { status: 'success', code: res.status };
  return (await res.json()) as ApiEnvelope<T>;
}

export const api = {
  get: <T>(p: string, o?: RequestOptions) => request<T>(p, { ...o, method: 'GET' }),
  post: <T>(p: string, body?: unknown, o?: RequestOptions) => request<T>(p, { ...o, method: 'POST', body }),
  put: <T>(p: string, body?: unknown, o?: RequestOptions) => request<T>(p, { ...o, method: 'PUT', body }),
  patch: <T>(p: string, body?: unknown, o?: RequestOptions) => request<T>(p, { ...o, method: 'PATCH', body }),
  delete: <T>(p: string, o?: RequestOptions) => request<T>(p, { ...o, method: 'DELETE' }),
};
