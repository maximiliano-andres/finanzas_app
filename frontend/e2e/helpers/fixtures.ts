import { test as base, expect, type Page } from '@playwright/test';

/**
 * Fixture que vigila la consola y la red de CADA prueba:
 * - console.error / pageerror no esperados → la prueba falla.
 * - registra las solicitudes /flujopago/gestion-pagos/v1/* para detectar duplicadas.
 */
export interface NetLog { method: string; url: string; status?: number; t: number }

export const test = base.extend<{ consoleGuard: { allow: (re: RegExp) => void }; net: NetLog[] }>({
  net: async ({ page }, use) => {
    const log: NetLog[] = [];
    page.on('request', (r) => { if (r.url().includes('/flujopago/gestion-pagos/v1/') && !r.url().includes('/app/')) log.push({ method: r.method(), url: r.url(), t: Date.now() }); });
    page.on('response', (r) => { const e = [...log].reverse().find((x) => x.url === r.url() && x.status === undefined); if (e) e.status = r.status(); });
    await use(log);
  },
  consoleGuard: [async ({ page }, use) => {
    const allowed: RegExp[] = [
      /Failed to load resource: the server responded with a status of (401|403|404|409|422|429|400)/, // errores HTTP esperados en pruebas negativas
    ];
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !allowed.some((re) => re.test(m.text()))) errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await use({ allow: (re) => allowed.push(re) });
    expect(errors, `Errores de consola inesperados:\n${errors.join('\n')}`).toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function toast(page: Page, type: 'success' | 'error' | 'warning' | 'info', text: string | RegExp) {
  await expect(page.getByTestId(`toast-${type}`).filter({ hasText: text }).first()).toBeVisible();
}

/** Detecta GET duplicados idénticos dentro de una ventana corta (posible doble fetch). */
export function duplicateGets(log: NetLog[], windowMs = 1500): string[] {
  const dups: string[] = [];
  const gets = log.filter((l) => l.method === 'GET');
  gets.forEach((a, i) => gets.slice(i + 1).forEach((b) => { if (a.url === b.url && b.t - a.t < windowMs) dups.push(a.url); }));
  return [...new Set(dups)];
}
