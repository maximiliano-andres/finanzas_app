/**
 * Genera las capturas de docs/screenshots con Playwright contra un backend con datos de demostración.
 * Lo invoca scripts/capturar_screenshots.sh (levanta el stack y siembra los datos). Variables:
 *   FLUJOPAGO_SHOTS_BASE  URL del backend (ej. http://localhost:8077)
 *   FLUJOPAGO_SHOTS_TOKEN JWT de la usuaria demo con el 2FA verificado (lo imprime seed_demo.py)
 */
import { chromium } from 'playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.FLUJOPAGO_SHOTS_BASE ?? 'http://localhost:8077';
const TOKEN = process.env.FLUJOPAGO_SHOTS_TOKEN;
const APP = `${BASE}/flujopago/gestion-pagos/v1/app`;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/screenshots');
if (!TOKEN) throw new Error('Falta FLUJOPAGO_SHOTS_TOKEN');

const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-CL', timezoneId: 'America/Santiago' };
const sessionCookie = { name: 'access_token', value: TOKEN, url: BASE, httpOnly: true, sameSite: 'Lax' };

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

// 01 · Login (sin sesión)
{
  const ctx = await browser.newContext(desktop);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await settle(page);
  await page.locator('#password').fill('Demo_Captura2026!');
  await page.locator('#email').blur();
  await page.screenshot({ path: `${OUT}/01-login.png` });
  await ctx.close();
}

// 02-05 · Escritorio con sesión de administradora
{
  const ctx = await browser.newContext(desktop);
  await ctx.addCookies([sessionCookie]);
  const page = await ctx.newPage();

  await page.goto(`${APP}/`);
  await page.getByText('Solicitudes Recientes').waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/02-dashboard.png` });

  await page.goto(`${APP}/nueva-solicitud`);
  await page.getByText('Registro de Nueva Solicitud').waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/03-nueva-solicitud.png` });

  await page.goto(`${APP}/aprobaciones`);
  await page.getByText('Aprobaciones Pendientes Nivel 1').waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/04-aprobacion-rrhh.png` });

  await page.goto(`${APP}/todas-solicitudes`);
  await page.getByTestId('ver-detalle-1040').click();
  await page.getByText('Detalle de Solicitud #1040').waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/05-detalle-solicitud.png` });
  await ctx.close();
}

// 06 · Vista móvil del dashboard
{
  const ctx = await browser.newContext({ ...desktop, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addCookies([sessionCookie]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/`);
  await page.getByText('Solicitudes Recientes').waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/06-vista-movil.png` });
  await ctx.close();
}

await browser.close();
console.log(`Capturas generadas en ${OUT}`);
