import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN, API, OUT } from '../helpers/env';
import { freshTotp } from '../helpers/totp';
import { ApiSession } from '../helpers/api';
import { tinyPdf } from '../helpers/pdf';

/**
 * Carga del dashboard (usuario admin, 2FA real) medida con CDP en Chromium:
 * solicitudes HTTP, bytes transferidos, tiempo hasta datos visibles, CPU (TaskDuration) y heap JS.
 * MODE=react (el modo legacy solo puede medirse en un commit anterior al retiro del frontend original). Cada modo se mide 3 veces (mediana).
 */
const MODE = process.env.MODE ?? 'react';
const N_SOLICITUDES = 30;

/** Mismo dataset para ambos modos: admin con 2FA + 30 solicitudes reales creadas vía API. */
test.beforeAll(async () => {
  const statePath = join(OUT, 'state.json');
  const prev = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const s = await ApiSession.create();
  await s.login(ADMIN.email, ADMIN.password);
  const adminSecret = await s.completeMfa(prev.adminSecret);
  writeFileSync(statePath, JSON.stringify({ ...prev, adminSecret }, null, 2));
  const existing = (await s.json('GET', '/todas_solicitudes')).body.data.length as number;
  const emp = (await s.json('GET', '/empresas')).body.data[0];
  const obra = (await s.json('GET', '/procesos_auxiliares')).body.data[0];
  const proc = (await s.json('GET', '/procesos')).body.data[0];
  for (let i = existing; i < N_SOLICITUDES; i++) {
    const folio = `9${String(Date.now()).slice(-6)}${i}`;
    const r = await s.ctx.post(`${API}/todas_solicitudes`, { multipart: {
      solicitante: 'Super Administrador', fecha_solicitud: '2026-11-02', empresa: emp.empresa, obra: obra.detalle, proceso: proc.nombre,
      monto: '1000', estado: 'ESPERANDO', reviso: 'Jefe de Recursos Humanos', mes_de_proceso: 'NOVIEMBRE', anio: '2026',
      cuenta_contable: proc.cuenta_objeto, auxiliar: obra.auxiliar, fecha_de_pago: '2026-11-20', unidad_de_negocio: `${emp.codigo}${obra.auxiliar}`,
      folio, montos_por_folio: '1000', forma_pago: 'DEPOSITO', pdfs: { name: `${folio}_r.pdf`, mimeType: 'application/pdf', buffer: tinyPdf() },
    } });
    expect(r.status(), await r.text()).toBe(200);
  }
  await s.dispose();
});

async function login(page: Page) {
  const secret = JSON.parse(readFileSync(join(OUT, 'state.json'), 'utf8')).adminSecret as string;
  await page.goto(`${API}/`);
  await page.locator('#email').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.locator('#loginForm button[type="submit"]').click();
  await page.waitForURL(/mfa/);
  await page.locator('#verifyCode').waitFor();
  await page.locator('#verifyCode').fill(await freshTotp(secret));
  await page.locator('#verifyForm button[type="submit"]').click();
  await page.waitForURL(/dashboard|\/app\/?$/);
}

async function measure(page: Page, cdp: CDPSession) {
  let requests = 0; let bytes = 0; const apiCalls: string[] = [];
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  cdp.on('Network.requestWillBeSent', (e) => {
    requests++;
    if (/\/flujopago\/gestion-pagos\/v1\/(?!app\/|public\/)/.test(e.request.url) && !/\.(js|css|webp|woff2?)$/.test(e.request.url)) apiCalls.push(`${e.request.method} ${new URL(e.request.url).pathname}`);
  });
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); // carga en frío
  await cdp.send('Performance.enable');
  const before = await cdp.send('Performance.getMetrics');
  const t0 = Date.now();
  await page.goto(MODE === 'legacy' ? `${API}/dashboard` : `${API}/app/`);
  await expect(page.locator('#statTotal')).not.toHaveText(/^$/);
  await page.waitForFunction(() => document.querySelector('#recentSolicitudes, #sectionDashboard table, #sectionDashboard') !== null);
  const visibleMs = Date.now() - t0;
  await page.waitForLoadState('networkidle');
  const after = await cdp.send('Performance.getMetrics');
  const m = (src: typeof after, n: string) => src.metrics.find((x) => x.name === n)?.value ?? 0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
  return {
    requests, kb: Math.round(bytes / 1024), apiCalls: apiCalls.length, apiDetail: apiCalls,
    visibleMs, dclMs: Math.round(nav.dcl), loadMs: Math.round(nav.load),
    cpuMs: Math.round((m(after, 'TaskDuration') - m(before, 'TaskDuration')) * 1000),
    heapMB: +(m(after, 'JSHeapUsedSize') / 1048576).toFixed(1),
  };
}

test(`PERF ${MODE}`, async ({ browser }) => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    const cdp = await ctx.newCDPSession(page);
    runs.push(await measure(page, cdp));
    await ctx.close();
  }
  const med = (k: keyof (typeof runs)[0]) => [...runs].map((r) => r[k] as number).sort((a, b) => a - b)[1];
  const result = { mode: MODE, requests: med('requests'), kb: med('kb'), apiCalls: med('apiCalls'), visibleMs: med('visibleMs'), dclMs: med('dclMs'), loadMs: med('loadMs'), cpuMs: med('cpuMs'), heapMB: med('heapMB'), apiDetail: runs[1].apiDetail };
  const file = join(OUT, 'perf.json');
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  all[MODE] = result;
  writeFileSync(file, JSON.stringify(all, null, 2));
  console.log(JSON.stringify(result));
});
