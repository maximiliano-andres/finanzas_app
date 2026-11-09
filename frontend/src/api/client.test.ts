import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buildUrl, extractMessage, request, setSecurityRedirectHandler, setUnauthorizedHandler } from './client';

const json = (body: unknown, status = 200, extra: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' }, ...extra });

afterEach(() => { vi.restoreAllMocks(); setUnauthorizedHandler(null); setSecurityRedirectHandler(null); });

describe('api client — los 3 formatos de respuesta del backend', () => {
  it('desenvuelve el sobre success → data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'success', code: 200, message: 'ok', data: [1, 2] }));
    await expect(request('/x')).resolves.toEqual([1, 2]);
  });

  it('HTTP 200 con status:"error" (sin data) es un ERROR con el code del cuerpo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'error', code: 400, message: 'La contraseña actual es incorrecta.' }));
    const err = await request('/password/force-change').catch((e: unknown) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('La contraseña actual es incorrecta.');
  });

  it('{"detail": str} de FastAPI → mensaje del detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Solicitud no encontrada' }, 404));
    await expect(request('/x')).rejects.toMatchObject({ status: 404, message: 'Solicitud no encontrada' });
  });

  it('422 con lista pydantic → primer msg', () => {
    expect(extractMessage({ detail: [{ msg: 'Value error, X' }] }, 422)).toBe('Value error, X');
  });

  it('401 dispara el manejador global (sesión expirada); skipGlobalHandlers lo evita', async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Token expirado' }, 401));
    await expect(request('/x')).rejects.toMatchObject({ status: 401 });
    expect(onUnauth).toHaveBeenCalledTimes(1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Token expirado' }, 401));
    await expect(request('/x', { skipGlobalHandlers: true })).rejects.toMatchObject({ status: 401 });
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it('403 del MFAMiddleware con redirect_to dispara el manejador de seguridad', async () => {
    const onSec = vi.fn();
    setSecurityRedirectHandler(onSec);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'error', code: 403, message: 'Validación o Configuración 2FA requerida.', redirect_to: '/flujopago/gestion-pagos/v1/mfa/verify' }, 403));
    const err = await request('/x').catch((e: unknown) => e) as ApiError;
    expect(err.redirectTo).toContain('/mfa/verify');
    expect(onSec).toHaveBeenCalledOnce();
  });

  it('500 sin cuerpo JSON → mensaje genérico seguro', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>boom</html>', { status: 500, headers: { 'content-type': 'text/html' } }));
    await expect(request('/x')).rejects.toMatchObject({ status: 500, message: 'Error interno del servidor. Intente nuevamente más tarde.' });
  });

  it('error de red → kind network con mensaje claro', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('/x')).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('No se pudo conectar') });
  });

  it('timeout aborta la solicitud', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_u, init) => new Promise((_r, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    }));
    await expect(request('/x', { timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('envía cookies same-origin, Accept JSON y nunca Authorization', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'success', data: null }));
    await request('/x', { method: 'POST', body: { a: 1 } });
    const init = f.mock.calls[0][1]!;
    const h = new Headers(init.headers);
    expect(init.credentials).toBe('same-origin');
    expect(h.get('Accept')).toBe('application/json');
    expect(h.get('Content-Type')).toBe('application/json');
    expect(h.has('Authorization')).toBe(false);
    expect(init.body).toBe('{"a":1}');
  });

  it('buildUrl antepone el prefijo y omite parámetros vacíos', () => {
    expect(buildUrl('/empresas')).toBe('/flujopago/gestion-pagos/v1/empresas');
    expect(buildUrl('/x', { a: 1, b: '', c: undefined, d: 'z y' })).toBe('/flujopago/gestion-pagos/v1/x?a=1&d=z+y');
  });
});
