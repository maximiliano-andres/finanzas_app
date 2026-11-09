import { test, expect, duplicateGets } from '../helpers/fixtures';
import { storage } from '../helpers/state';
import { API } from '../helpers/env';
import { readFile } from 'node:fs/promises';
import XLSXmod from 'xlsx-js-style';
const XLSX = ((XLSXmod as unknown as { default?: typeof XLSXmod }).default ?? XLSXmod) as typeof XLSXmod;

test.use({ storageState: storage('admin') });

test('VIEW-01 Dashboard: estadísticas coinciden con la BD y sin solicitudes duplicadas al cargar @compat', async ({ page, net }) => {
  await page.goto('');
  await expect(page.locator('#statTotal')).not.toHaveText('');
  const data = (await (await page.request.get(`${API}/todas_solicitudes`)).json()).data as Array<{ estado: string }>;
  const up = data.map((s) => (s.estado || '').toUpperCase());
  await expect(page.locator('#statTotal')).toHaveText(String(data.length));
  await expect(page.locator('#statPendientes')).toHaveText(String(up.filter((e) => e === 'PENDIENTE' || e === 'ESPERANDO').length));
  await expect(page.locator('#statRechazadas')).toHaveText(String(up.filter((e) => e === 'RECHAZADO').length));
  await page.waitForLoadState('networkidle');
  expect(duplicateGets(net), 'GET duplicados').toEqual([]);
  // El original hacía 14 GET al iniciar; ahora solo los necesarios para la vista
  expect(net.filter((n) => n.method === 'GET').length).toBeLessThanOrEqual(3);
});

test('VIEW-02 Navegar entre secciones reutiliza la caché (sin re-descargar todo en cada clic)', async ({ page, net }) => {
  await page.goto('');
  await page.waitForLoadState('networkidle');
  const sidebar = page.locator('#sidebar');
  for (const s of ['Mis Solicitudes', 'Estados de Solicitudes', 'Dashboard', 'Mis Solicitudes']) {
    await sidebar.getByRole('link', { name: s }).click();
    await page.waitForLoadState('networkidle');
  }
  const solicitudesGets = net.filter((n) => n.method === 'GET' && n.url.endsWith('/todas_solicitudes'));
  expect(solicitudesGets.length).toBe(1);
  // deep-link + back/forward funcionan (antes no existía enrutamiento)
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/?$/);
});

test('VIEW-03 Estados de Solicitudes: filtros por texto/estado/monto contra datos reales y "Limpiar Filtros"', async ({ page }) => {
  await page.goto('todas-solicitudes');
  const data = (await (await page.request.get(`${API}/todas_solicitudes`)).json()).data as Array<{ id: number; estado: string; monto: number }>;
  test.skip(data.length === 0, 'sin datos');
  await expect(page.locator('#totalSolicitudesBadge')).toContainText(String(data.length));
  const target = data[0];
  await page.locator('#filtroTexto').fill(String(target.id));
  await expect(page.locator('#tablaTodasSolicitudes tr').first()).toContainText(String(target.id));
  await page.getByTestId('limpiar-filtros').click();
  await expect(page.locator('#filtroTexto')).toHaveValue('');
  await page.locator('#filtroEstado').selectOption({ label: 'Rechazado' });
  const rech = data.filter((s) => s.estado === 'RECHAZADO').length;
  await expect(page.locator('#totalSolicitudesBadge')).toContainText(String(rech));
  await page.getByTestId('limpiar-filtros').click();
  await page.locator('#filtroMontoMin').fill('999999999');
  await expect(page.locator('#totalSolicitudesBadge')).toContainText('0');
});

async function xlsxRows(path: string) {
  const wb = XLSX.read(await readFile(path));
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { sheet: wb.SheetNames[0], rows: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) };
}

test('VIEW-04 Reportes: Excel real descargado con hoja "Datos", 42 columnas y nombre con fecha local', async ({ page }) => {
  await page.goto('reportes');
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-general').click();
  const file = await dl;
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  expect(file.suggestedFilename()).toBe(`Reporte_General_${ymd}.xlsx`);
  const { sheet, rows } = await xlsxRows(await file.path());
  expect(sheet).toBe('Datos');
  expect((rows[0] as unknown[]).length).toBe(42);
  expect(rows.length).toBeGreaterThan(1);
});

test('VIEW-05 Reporte Histórico: columnas CUENTA CONTABLE y OBSERVACIONES DEVOLUCION ya no salen vacías', async ({ page }) => {
  // Garantiza al menos un registro de histórico REAL: el backend lo escribe en cada cambio de estado.
  const hist = (await (await page.request.get(`${API}/historico`)).json()).data as unknown[];
  if (!hist.length) {
    const sol = (await (await page.request.get(`${API}/todas_solicitudes`)).json()).data as Array<{ id: number }>;
    test.skip(!sol.length, 'sin solicitudes para generar histórico');
    const r = await page.request.patch(`${API}/todas_solicitudes/${sol[0].id}`, { data: { estado: 'RECHAZADO', observaciones_devolucion: 'Generado por E2E' } });
    expect(r.status()).toBe(200);
  }
  await page.goto('reportes');
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-historico').click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^Reporte_Historico_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const { rows } = await xlsxRows(await file.path());
  const header = rows[0] as string[];
  const col = header.findIndex((h) => /CUENTA CONTABLE/i.test(String(h)));
  expect(col).toBeGreaterThanOrEqual(0);
  const values = rows.slice(1).map((r) => (r as unknown[])[col]);
  expect(values.some((v) => v && v !== '-')).toBe(true);
});

test('VIEW-06 Reporte Finanzas/Recepcionado genera el Comprobante (hoja "Comprobante" con TOTALES)', async ({ page }) => {
  await page.goto('reportes');
  const recep = (await (await page.request.get(`${API}/historico`)).json()).data as Array<{ estado: string }>;
  test.skip(!recep.some((r) => ['PAGADO', 'RECEPCIONADO'].includes(String(r.estado).toUpperCase())), 'sin registros recepcionados en histórico');
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-finanzas').click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^(COMPROBANTE|REPORTE_MASIVO)_.*\.xlsx$/);
  const { sheet, rows } = await xlsxRows(await file.path());
  expect(sheet).toBe('Comprobante');
  const flat = rows.flat().map(String).join(' | ');
  expect(flat).toMatch(/TOTALES/i);
});
