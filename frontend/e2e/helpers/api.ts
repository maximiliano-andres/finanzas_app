import { request, type APIRequestContext } from '@playwright/test';
import { API, BASE } from './env';
import { freshTotp, secretFromUri } from './totp';

/** Cliente HTTP real contra el backend (para preparar datos; las pruebas de UI usan el navegador). */
export class ApiSession {
  private constructor(public ctx: APIRequestContext) {}
  static async create() { return new ApiSession(await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Accept: 'application/json' } })); }

  async json(method: string, path: string, data?: unknown) {
    const res = await this.ctx.fetch(`${API}${path}`, { method, data });
    const body = await res.json().catch(() => null);
    return { status: res.status(), body };
  }

  async login(email: string, password: string, remember = false) {
    const r = await this.json('POST', '/login', { email, password, remember_device: remember });
    if (r.status !== 200) throw new Error(`login ${email} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }

  /** Configura 2FA (si no está) o lo verifica; devuelve el secreto TOTP. */
  async completeMfa(existingSecret?: string): Promise<string> {
    const st = await this.json('GET', '/mfa/status');
    if (st.body?.data?.mfa_enabled) {
      if (!existingSecret) throw new Error('MFA ya habilitado y no hay secreto conocido');
      const v = await this.json('POST', '/mfa/verify', { code: await freshTotp(existingSecret) });
      if (v.body?.status !== 'success') throw new Error(`mfa verify: ${JSON.stringify(v.body)}`);
      return existingSecret;
    }
    const setup = await this.json('POST', '/mfa/setup');
    const secret = secretFromUri(setup.body.data.provisioning_uri);
    const v = await this.json('POST', '/mfa/verify-setup', { code: await freshTotp(secret) });
    if (v.body?.status !== 'success') throw new Error(`mfa verify-setup: ${JSON.stringify(v.body)}`);
    return secret;
  }

  async forceChange(oldPw: string, newPw: string) {
    const r = await this.json('POST', '/password/force-change', { old_password: oldPw, new_password: newPw, confirm_password: newPw });
    if (r.body?.status !== 'success') throw new Error(`force-change: ${JSON.stringify(r.body)}`);
  }

  async dispose() { await this.ctx.dispose(); }
}
