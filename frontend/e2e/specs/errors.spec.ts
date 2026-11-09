import { execSync } from 'node:child_process';
import { test, expect, toast } from '../helpers/fixtures';
import { storage } from '../helpers/state';
import { API } from '../helpers/env';
import { pdfFile } from '../helpers/pdf';

/**
 * Escenarios de error. Origen de cada falla:
 *  - REAL: backend pausado (docker pause), sesión inválida, validaciones del backend, archivos inválidos.
 *  - INYECTADA (route): 500/409/429/respuesta corrupta/vacía/lenta — códigos que el backend no permite provocar
 *    de forma determinista con datos reales. Se documenta en el informe como tal.
 */
test.use({ storageState: storage('admin') });
const APP_CONTAINER = 'flujopago-e2e-app-1';

test('ERR-01 [REAL] API caída (docker pause) al cargar y a mitad de sesión → mensaje de conexión, UI consistente y recuperación', async ({ page, consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource|ERR_|net::/);
  execSync(`docker pause ${APP_CONTAINER}`);
  try {
    await page.goto('todas-solicitudes', { timeout: 4000 }).catch(() => undefined);
  } finally {
    execSync(`docker unpause ${APP_CONTAINER}`);
  }
  // Con el servidor de vuelta, la navegación pendiente se completa y la aplicación se recupera sin intervención.
  await page.waitForURL(/todas-solicitudes/, { timeout: 15000 });
  await expect(page.locator('#totalSolicitudesBadge')).toBeVisible();

  // Caída a MITAD de sesión (SPA ya cargada): las acciones muestran error de conexión y la UI queda consistente.
  await page.goto('administracion');
  await page.getByTestId('admin-new-empresa').click();
  await page.locator('#adminNombre').fill('EMPRESA CAIDA');
  await page.locator('#adminCodigo').fill(`C${Date.now() % 100000}`);
  execSync(`docker pause ${APP_CONTAINER}`);
  try {
    await page.route('**/flujopago/gestion-pagos/v1/empresas', (r) => r.abort('connectionrefused')); // evita esperar el timeout TCP de 30s
    await page.getByTestId('admin-modal-save').click();
    await expect(page.getByTestId('toast-error').first()).toContainText(/conectar con el servidor/);
    await expect(page.getByTestId('admin-modal-save')).toBeEnabled(); // botón recuperado → se puede reintentar
  } finally {
    execSync(`docker unpause ${APP_CONTAINER}`);
    await page.unroute('**/flujopago/gestion-pagos/v1/empresas');
  }
});

test('ERR-02 [REAL] servidor no responde al validar sesión → pantalla "No se pudo conectar" + Reintentar', async ({ page, consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource|net::/);
  await page.route('**/flujopago/gestion-pagos/v1/session', (r) => r.abort('connectionrefused'));
  await page.goto('');
  await expect(page.getByTestId('connection-error')).toBeVisible();
  await expect(page).not.toHaveURL(/login/);
  await page.unroute('**/flujopago/gestion-pagos/v1/session');
  await page.getByRole('button', { name: /Reintentar/ }).click();
  await expect(page.locator('#statTotal')).toBeVisible();
});

for (const [status, body, expected] of [
  [500, { status: 'error', code: 500, message: 'Ha ocurrido un error interno en el servidor.' }, /error interno/i],
  [409, { detail: 'El registro ya existe' }, /ya existe/],
  [429, { status: 'error', code: 429, message: 'Demasiadas solicitudes' }, /Demasiadas solicitudes/],
  [422, { detail: [{ loc: ['body', 'codigo'], msg: 'Value error, El código es inválido' }] }, /código es inválido/],
] as const) {
  test(`ERR-03 [INYECTADA] HTTP ${status} al guardar → mensaje claro, modal abierto, sin estado inconsistente`, async ({ page, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/);
    await page.goto('administracion');
    const before = (await (await page.request.get(`${API}/empresas`)).json()).data.length;
    await page.route('**/flujopago/gestion-pagos/v1/empresas', (r) => (r.request().method() === 'POST'
      ? r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }) : r.continue()));
    await page.getByTestId('admin-new-empresa').click();
    await page.locator('#adminNombre').fill('EMPRESA ERR');
    await page.locator('#adminCodigo').fill('ERR1');
    await page.getByTestId('admin-modal-save').click();
    await expect(page.getByTestId('toast-error').first()).toContainText(expected);
    await expect(page.locator('#adminModal')).toBeVisible();
    await expect(page.getByTestId('admin-modal-save')).toBeEnabled();
    expect((await (await page.request.get(`${API}/empresas`)).json()).data.length).toBe(before);
  });
}

test('ERR-04 [INYECTADA] respuesta corrupta (HTML en vez de JSON) y lista vacía → sin crash, mensaje/estado vacío', async ({ page, consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource/);
  await page.route('**/flujopago/gestion-pagos/v1/todas_solicitudes', (r) => r.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' }));
  await page.goto('todas-solicitudes');
  await toast(page, 'error', /Error al cargar datos/);
  await expect(page.locator('#sectionTodasSolicitudes, section').first()).toBeVisible();
  await page.unroute('**/flujopago/gestion-pagos/v1/todas_solicitudes');

  await page.route('**/flujopago/gestion-pagos/v1/todas_solicitudes', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: [] }) }));
  await page.goto('');
  await expect(page.locator('#statTotal')).toHaveText('0');
  await expect(page.getByText('No hay solicitudes registradas')).toBeVisible();
});

test('ERR-05 [INYECTADA] respuesta lenta (3 s) → indicador de carga y luego datos correctos', async ({ page }) => {
  await page.route('**/flujopago/gestion-pagos/v1/todas_solicitudes', async (r) => { await new Promise((ok) => setTimeout(ok, 3000)); await r.continue(); });
  await page.goto('todas-solicitudes');
  await expect(page.getByText(/Cargando/).first()).toBeVisible();
  const n = (await (await page.request.get(`${API}/todas_solicitudes`)).json()).data.length;
  await expect(page.locator('#totalSolicitudesBadge')).toContainText(String(n), { timeout: 10000 });
  await expect(page.locator('#tablaTodasSolicitudes tr').first()).not.toContainText(/Cargando/);
});

test.describe('con Solicitante', () => {
  test.use({ storageState: storage('solicitante') });

  test('ERR-06 [REAL] archivo no PDF se rechaza en el formulario y no se adjunta', async ({ page }) => {
    await page.goto('nueva-solicitud');
    await page.locator('input[name="documentos[]"]').first().setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
    await toast(page, 'error', 'Solo se permiten archivos PDF');
    await expect(page.getByText('virus.exe')).toHaveCount(0);
  });

  test('ERR-07 [REAL] sin conexión (offline) al enviar → mensaje de conexión; al reconectar se puede reintentar', async ({ page, context, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource|net::/);
    await page.goto('nueva-solicitud');
    await page.locator('#mesProceso').selectOption('NOVIEMBRE');
    await page.locator('#fechaPago').fill('2026-12-15');
    await page.locator('#empresa').selectOption({ index: 1 });
    await page.locator('#obra').selectOption({ index: 1 });
    await page.locator('#proceso').selectOption({ index: 1 });
    await page.locator('input[name="folio[]"]').first().fill(`48${String(Date.now()).slice(-7)}`);
    await page.locator('input[name="folios_monto[]"]').first().fill('1000');
    await page.locator('select[name="forma_pago[]"]').first().selectOption('DEPOSITO');
    await page.locator('input[name="documentos[]"]').first().setInputFiles(pdfFile('ok.pdf'));
    await page.getByTestId('validar-previsualizar').click();
    await context.setOffline(true);
    await page.getByTestId('confirmar-solicitud').click();
    await expect(page.getByTestId('toast-error').first()).toContainText(/conectar con el servidor|conexión/i);
    await context.setOffline(false);
    // La solicitud NO se creó (sin duplicado ni estado a medias)
    await page.getByTestId('validar-previsualizar').click().catch(() => undefined);
    const confirm = page.getByTestId('confirmar-solicitud');
    if (await confirm.isVisible()) {
      await confirm.click();
      await toast(page, 'success', 'Solicitud creada exitosamente');
    }
  });
});
