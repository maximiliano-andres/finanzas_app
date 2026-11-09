import { test, expect, toast } from '../helpers/fixtures';
import { storage, state } from '../helpers/state';
import { API, APP } from '../helpers/env';
import { pdfFile } from '../helpers/pdf';
import type { Browser, Page } from '@playwright/test';

/**
 * Flujo de negocio COMPLETO con usuarios reales de cada rol:
 * Solicitante crea (UI, multipart + PDF) → envía → RRHH aprueba N1 → SCP carga autorización y aprueba N2
 * → Finanzas aprueba → recepciona → aparece en Recepcionadas. Cada paso se verifica en la BD vía API.
 */
test.describe.configure({ mode: 'serial' });

const folio = `45${String(Date.now()).slice(-7)}`;
let solicitudId = 0;
let rechazadaId = 0;

async function as(browser: Browser, role: string): Promise<Page> {
  const ctx = await browser.newContext({ storageState: storage(role), locale: 'es-CL', timezoneId: 'America/Santiago' });
  return ctx.newPage();
}
async function estadoDe(page: Page, id: number): Promise<string | undefined> {
  const list = (await (await page.request.get(`${API}/todas_solicitudes`)).json()).data as Array<{ id: number; estado: string }>;
  return list.find((s) => s.id === id)?.estado;
}
function isoPlus(days: number) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.use({ storageState: storage('solicitante') });

test('WF-01 Solicitante: validación, previsualización y creación real con PDF', async ({ page, net }) => {
  await page.goto('nueva-solicitud');
  await page.getByTestId('validar-previsualizar').click();
  await expect(page.getByTestId('toast-error').first()).toBeVisible(); // campos obligatorios
  expect(net.filter((n) => n.method === 'POST')).toHaveLength(0);

  await page.locator('#mesProceso').selectOption('NOVIEMBRE');
  await page.locator('#fechaPago').fill(isoPlus(10));
  await page.locator('#empresa').selectOption({ index: 1 });
  await page.locator('#obra').selectOption({ index: 1 });
  await page.locator('#proceso').selectOption({ index: 1 });
  await expect(page.locator('#une')).not.toHaveValue('');
  await expect(page.locator('#glosa')).not.toHaveValue('');
  await page.locator('input[name="folio[]"]').first().fill(folio);
  await page.locator('input[name="folios_monto[]"]').first().fill('150000');
  await expect(page.locator('#monto')).toHaveValue(/150\.000/);
  await page.locator('select[name="forma_pago[]"]').first().selectOption('DEPOSITO');
  await page.locator('input[name="documentos[]"]').first().setInputFiles(pdfFile('respaldo.pdf'));
  await expect(page.getByText('respaldo.pdf')).toBeVisible();
  await page.locator('#observaciones').fill('Prueba E2E <script>alert(1)</script>');

  await page.getByTestId('validar-previsualizar').click();
  await expect(page.locator('#previewModal')).toBeVisible();
  await expect(page.locator('#previewMonto')).toContainText('150.000');
  await expect(page.locator('#previewObservaciones')).toContainText('<script>alert(1)</script>'); // texto, no HTML ejecutado

  const created = page.waitForResponse((r) => r.url().endsWith('/todas_solicitudes') && r.request().method() === 'POST');
  await page.getByTestId('confirmar-solicitud').dblclick(); // doble clic → una sola solicitud
  const resp = await created;
  expect(resp.status()).toBe(200);
  await toast(page, 'success', 'Solicitud creada exitosamente');
  expect(net.filter((n) => n.method === 'POST' && n.url.endsWith('/todas_solicitudes'))).toHaveLength(1);

  const list = (await (await page.request.get(`${API}/todas_solicitudes`)).json()).data as Array<Record<string, unknown>>;
  const s = list.find((x) => x.folio_uno === folio || x.folio === folio)!;
  expect(s, 'la solicitud existe en la BD').toBeTruthy();
  solicitudId = s.id as number;
  expect(s.estado).toBe('ESPERANDO');
  expect(s.monto).toBe(150000);
  expect(String(s.pdf_folio_uno)).toContain('.pdf');
});

test('WF-02 Solicitante: detalle con PDF real y envío a aprobación', async ({ page }) => {
  test.skip(!solicitudId, 'depende de WF-01');
  await page.goto('mis-solicitudes');
  await page.getByTestId(`ver-detalle-${solicitudId}`).click();
  await expect(page.getByTestId('detail-modal')).toContainText(`#${solicitudId}`);
  const pdfResp = page.waitForResponse((r) => r.url().includes('doc_pdf/'));
  await page.getByTestId('ver-pdf-folio-1').click();
  expect((await pdfResp).status()).toBe(200);
  await expect(page.locator('#pdfFrame')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Cerrar visor' }).click();
  await page.getByTestId('detail-close').click();

  const row = page.locator('tr', { has: page.getByTestId(`ver-detalle-${solicitudId}`) });
  await row.locator('input[type="checkbox"]').check();
  const card = page.locator('[data-testid^="card-"]', { has: row });
  await card.locator('[data-testid^="btn-enviar-"]').click();
  await page.locator('#modalConfirmBtn').click();
  await toast(page, 'success', '1 solicitud(es) enviada(s) correctamente');
  await expect.poll(() => estadoDe(page, solicitudId)).toBe('PENDIENTE');
});

test('WF-03 RRHH aprueba Nivel 1', async ({ browser }) => {
  test.skip(!solicitudId, 'depende de WF-02');
  const page = await as(browser, 'rrhh');
  await page.goto(`${APP}/aprobaciones`);
  await page.getByTestId(`btn-aprobar-${solicitudId}`).click();
  await expect(page.locator('#actionModal')).toBeVisible();
  await page.locator('#comentariosAccion').fill('Aprobado E2E');
  await page.getByTestId('btn-confirmar-accion').click();
  await expect(page.getByTestId('toast-success').first()).toBeVisible();
  await expect.poll(() => estadoDe(page, solicitudId)).toBe('APROBADO NIVEL 1');
  await expect(page.getByTestId(`btn-aprobar-${solicitudId}`)).toHaveCount(0);
  await page.context().close();
});

test('WF-04 SCP aprueba Nivel 2 (tipo "Mis Solicitudes": sin requisito de PDF de autorización, como legacy)', async ({ browser }) => {
  test.skip(!solicitudId, 'depende de WF-03');
  const page = await as(browser, 'scp');
  await page.goto(`${APP}/aprobaciones2`);
  await page.getByTestId(`btn-aprobar-${solicitudId}`).click();
  await page.getByTestId('btn-confirmar-accion').click();
  await expect.poll(() => estadoDe(page, solicitudId)).toBe('APROBADO NIVEL 2');
  await page.context().close();
});

test('WF-05 Finanzas aprueba y recepciona → registro en Recepcionadas', async ({ browser }) => {
  test.skip(!solicitudId, 'depende de WF-04');
  const page = await as(browser, 'finanzas');
  await page.goto(`${APP}/finanzas`);
  await page.getByTestId(`btn-aprobar-${solicitudId}`).click();
  const confirm = page.locator('#modalConfirmBtn, [data-testid="btn-confirmar-accion"]').first();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect.poll(() => estadoDe(page, solicitudId), { timeout: 15000 }).toBe('APROBADO FINANZAS');

  const card = page.locator('[data-testid^="card-"]', { has: page.locator(`[data-testid="btn-aprobar-${solicitudId}"], [data-testid="btn-devolver-${solicitudId}"], [data-testid="ver-detalle-${solicitudId}"]`) }).first();
  await card.getByRole('button', { name: /Aprobación de finanzas/ }).click();
  await page.locator('#modalConfirmBtn').click();
  await expect.poll(() => estadoDe(page, solicitudId), { timeout: 15000 }).toBeUndefined(); // sale de solicitudes
  const recep = (await (await page.request.get(`${API}/recepcionado`)).json()).data as Array<{ id: number; folio_uno: string; estado: string }>;
  const r = recep.find((x) => x.folio_uno === folio);
  expect(r, 'existe en recepcionado').toBeTruthy();

  await page.goto(`${APP}/recepcionado`);
  await expect(page.getByTestId(`recepcionado-row-${r!.id}`)).toBeVisible();
  await page.context().close();
});

test('WF-06 Devolución: RRHH devuelve con comentario → Solicitante la ve RECHAZADA con el comentario', async ({ page, browser }) => {
  // Datos: solicitud creada vía API real por el solicitante y enviada a PENDIENTE
  const form = new FormData();
  const emp = (await (await page.request.get(`${API}/empresas`)).json()).data[0];
  const obra = (await (await page.request.get(`${API}/procesos_auxiliares`)).json()).data[0];
  const proc = (await (await page.request.get(`${API}/procesos`)).json()).data[0];
  const f2 = `46${String(Date.now()).slice(-7)}`;
  const u = state().users.solicitante;
  const fields: Record<string, string> = {
    solicitante: 'PruebaSolicitante', fecha_solicitud: isoPlus(0), empresa: emp.empresa, obra: obra.detalle, proceso: proc.nombre,
    monto: '5000', estado: 'ESPERANDO', reviso: 'Jefe de Recursos Humanos', mes_de_proceso: 'NOVIEMBRE', anio: String(new Date().getFullYear()),
    cuenta_contable: proc.cuenta_objeto, auxiliar: obra.auxiliar, fecha_de_pago: isoPlus(5), unidad_de_negocio: `${emp.codigo}${obra.auxiliar}`,
  };
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append('folio', f2); form.append('montos_por_folio', '5000'); form.append('forma_pago', 'DEPOSITO');
  const multipart: Record<string, string> = {};
  form.forEach((v, k) => { multipart[k] = String(v); });
  const res = await page.request.post(`${API}/todas_solicitudes`, { multipart: { ...multipart, pdfs: pdfFile(`${f2}_x.pdf`) } });
  expect(res.status(), await res.text()).toBe(200);
  const list = (await (await page.request.get(`${API}/todas_solicitudes`)).json()).data as Array<{ id: number; folio_uno: string; folio: string }>;
  const id = list.find((x) => x.folio_uno === f2 || x.folio === f2)!.id;
  await page.request.patch(`${API}/todas_solicitudes/${id}`, { data: { estado: 'PENDIENTE' } });
  expect(u.email).toContain('solicitante');

  const rrhh = await as(browser, 'rrhh');
  await rrhh.goto(`${APP}/aprobaciones`);
  await rrhh.getByTestId(`btn-devolver-${id}`).click();
  await rrhh.locator('#comentariosAccion').fill('Falta respaldo del folio');
  await rrhh.getByTestId('btn-confirmar-accion').click();
  await expect.poll(() => estadoDe(rrhh, id)).toBe('RECHAZADO');
  await rrhh.context().close();
  rechazadaId = id;

  await page.goto('mis-solicitudes');
  await page.getByTestId(`ver-detalle-${id}`).click();
  await expect(page.getByTestId('detail-modal')).toContainText('Falta respaldo del folio');
  await expect(page.getByTestId('detail-edit')).toBeVisible(); // "Editar y Reenviar"
});

test('WF-07 Editar y Reenviar una solicitud RECHAZADA (cuadratura + PATCH real)', async ({ page }) => {
  test.skip(!rechazadaId, 'depende de WF-06');
  await page.goto('mis-solicitudes');
  await page.getByTestId(`ver-detalle-${rechazadaId}`).click();
  await page.getByTestId('detail-edit').click();
  await expect(page.getByTestId('edit-modal')).toBeVisible();
  await expect(page.getByTestId('edit-modal-submit')).toBeEnabled(); // cuadra: 5000 = 5000
  const patch = page.waitForResponse((r) => r.url().endsWith(`/todas_solicitudes/${rechazadaId}`) && r.request().method() === 'PATCH');
  await page.getByTestId('edit-modal-submit').click();
  expect((await patch).status()).toBe(200);
  await toast(page, 'success', 'Solicitud actualizada y reenviada exitosamente');
  // Regla legacy conservada: un RECHAZADO editado vuelve a PENDIENTE
  await expect.poll(() => estadoDe(page, rechazadaId)).toBe('PENDIENTE');
});

test('WF-08 Recepcionado → "Guardar como Nueva Solicitud" (tipo Recepcionado) → N2 exige PDF de autorización real', async ({ browser }) => {
  const admin = await as(browser, 'admin');
  const emp = (await (await admin.request.get(`${API}/empresas`)).json()).data[0];
  const obra = (await (await admin.request.get(`${API}/procesos_auxiliares`)).json()).data[0];
  const proc = (await (await admin.request.get(`${API}/procesos`)).json()).data[0];
  const f = `47${String(Date.now()).slice(-7)}`;
  const today = isoPlus(0);
  const r = await admin.request.post(`${API}/recepcionado`, { data: {
    solicitante: 'Super Administrador', fecha_emision: today, fecha_solicitud: today, folio: f, empresa: emp.empresa, obra: obra.detalle,
    proceso: proc.nombre, monto: 8000, estado: 'RECEPCIONADO', reviso: 'Finanzas', mes_de_proceso: 'NOVIEMBRE', anio: new Date().getFullYear(),
    cuenta_contable: proc.cuenta_objeto, auxiliar: obra.auxiliar, fecha_de_pago: isoPlus(3), unidad_de_negocio: `${emp.codigo}${obra.auxiliar}`,
    folio_uno: f, monto_por_folio_uno: 8000, forma_pago_folio_uno: 'DEPOSITO',
  } });
  expect(r.status(), await r.text()).toBe(200);
  const recepId = (await r.json()).data.id as number;

  await admin.goto(`${APP}/recepcionado`);
  await admin.getByTestId(`modificar-${recepId}`).click();
  await expect(admin.getByTestId('edit-modal')).toBeVisible();
  await admin.getByTestId('edit-modal-submit').click();
  await toast(admin, 'success', 'Registro guardado como nueva solicitud. El flujo de validación ha sido reiniciado');
  const all = (await (await admin.request.get(`${API}/todas_solicitudes`)).json()).data as Array<{ id: number; folio_uno: string; tipo_solicitud: string; estado: string }>;
  const nueva = all.find((x) => x.folio_uno === f)!;
  expect(nueva.tipo_solicitud).toBe('Recepcionado');
  expect(nueva.estado).toBe('PENDIENTE');
  const recepAfter = (await (await admin.request.get(`${API}/recepcionado`)).json()).data as Array<{ id: number }>;
  expect(recepAfter.find((x) => x.id === recepId)).toBeUndefined();
  await admin.context().close();

  const rrhh = await as(browser, 'rrhh');
  await rrhh.goto(`${APP}/aprobaciones`);
  await rrhh.getByTestId(`btn-aprobar-${nueva.id}`).click();
  await rrhh.getByTestId('btn-confirmar-accion').click();
  await expect.poll(() => estadoDe(rrhh, nueva.id)).toBe('APROBADO NIVEL 1');
  await rrhh.context().close();

  const scp = await as(browser, 'scp');
  await scp.goto(`${APP}/aprobaciones2`);
  await scp.getByTestId(`btn-aprobar-${nueva.id}`).click();
  await scp.getByTestId('btn-confirmar-accion').click();
  await expect(scp.locator('#customModal')).toContainText('PDF de Registro de Autorización Requerido');
  await scp.locator('#customModal button').last().click();
  expect(await estadoDe(scp, nueva.id)).toBe('APROBADO NIVEL 1'); // no avanzó
  if (await scp.locator('#actionModal').isVisible()) await scp.locator('#actionModal').getByRole('button', { name: /Cancelar/ }).click();

  await scp.locator(`#pdf-reg-auth-${nueva.id}-2`).setInputFiles(pdfFile('autorizacion.pdf'));
  await scp.locator('#modalConfirmBtn').click();
  await expect(scp.getByTestId('toast-success').first()).toBeVisible();
  await scp.getByTestId(`btn-aprobar-${nueva.id}`).click();
  await scp.getByTestId('btn-confirmar-accion').click();
  await expect.poll(() => estadoDe(scp, nueva.id)).toBe('APROBADO NIVEL 2');
  await scp.context().close();
});
