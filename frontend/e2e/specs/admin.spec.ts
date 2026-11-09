import { test, expect, toast } from '../helpers/fixtures';
import { storage } from '../helpers/state';
import { API, APP } from '../helpers/env';
import { latestMessageFor } from '../helpers/mailpit';

test.use({ storageState: storage('admin') });

const uniq = () => String(Date.now()).slice(-6);

async function openTab(page: import('@playwright/test').Page, key: 'empresas' | 'obras' | 'procesos' | 'usuarios') {
  await page.goto('administracion');
  await page.getByTestId(`admin-tab-${key}`).click();
}

test.describe('Administración — CRUD real contra la base de datos', () => {
  test('ADM-01 Empresa: crear → editar → eliminar, verificado vía API/BD @compat', async ({ page }) => {
    const code = `E2E${uniq()}`;
    await openTab(page, 'empresas');
    await page.getByTestId('admin-new-empresa').click();
    await page.locator('#adminNombre').fill(`EMPRESA PRUEBA ${code}`);
    await page.locator('#adminCodigo').fill(code);
    await page.getByTestId('admin-modal-save').click();
    await toast(page, 'success', 'Empresa creada exitosamente');
    const row = page.locator('#tablaAdminEmpresas tr', { hasText: code });
    await expect(row).toBeVisible();

    let db = (await (await page.request.get(`${API}/empresas`)).json()).data as Array<{ id: number; empresa: string; codigo: string }>;
    const created = db.find((e) => e.codigo === code);
    expect(created?.empresa).toBe(`EMPRESA PRUEBA ${code}`);

    await row.getByRole('button', { name: /^Editar/ }).click();
    await expect(page.locator('#adminNombre')).toHaveValue(`EMPRESA PRUEBA ${code}`);
    await page.locator('#adminNombre').fill(`EMPRESA EDITADA ${code}`);
    await page.getByTestId('admin-modal-save').click();
    await toast(page, 'success', 'Empresa actualizada exitosamente');
    db = (await (await page.request.get(`${API}/empresas`)).json()).data;
    expect(db.find((e) => e.id === created!.id)?.empresa).toBe(`EMPRESA EDITADA ${code}`);

    // Cancelar eliminación no borra
    await page.locator('#tablaAdminEmpresas tr', { hasText: code }).getByRole('button', { name: /Eliminar/ }).click();
    await page.locator('#modalCancelBtn').click();
    await expect(page.locator('#tablaAdminEmpresas tr', { hasText: code })).toBeVisible();

    await page.locator('#tablaAdminEmpresas tr', { hasText: code }).getByRole('button', { name: /Eliminar/ }).click();
    await page.locator('#modalConfirmBtn').click();
    await toast(page, 'success', 'Empresa eliminada');
    await expect(page.locator('#tablaAdminEmpresas tr', { hasText: code })).toHaveCount(0);
    db = (await (await page.request.get(`${API}/empresas`)).json()).data;
    expect(db.find((e) => e.id === created!.id)).toBeUndefined();
  });

  test('ADM-02 validación de requeridos no envía nada al backend', async ({ page, net }) => {
    await openTab(page, 'empresas');
    await page.getByTestId('admin-new-empresa').click();
    await page.getByTestId('admin-modal-save').click();
    await toast(page, 'error', 'Por favor complete todos los campos requeridos');
    expect(net.filter((n) => n.method === 'POST' && n.url.endsWith('/empresas'))).toHaveLength(0);
  });

  test('ADM-03 código de empresa duplicado → error claro y el modal sigue abierto', async ({ page }) => {
    const code = `DUP${uniq()}`;
    const r = await page.request.post(`${API}/empresas`, { data: { empresa: `DUP ${code}`, codigo: code } });
    expect(r.status()).toBe(200);
    await openTab(page, 'empresas');
    await page.getByTestId('admin-new-empresa').click();
    await page.locator('#adminNombre').fill(`OTRA ${code}`);
    await page.locator('#adminCodigo').fill(code);
    await page.getByTestId('admin-modal-save').click();
    await expect(page.getByTestId('toast-error').first()).toBeVisible();
    await expect(page.locator('#adminModal')).toBeVisible();
    // limpieza
    const id = (await r.json()).data.id;
    await page.request.delete(`${API}/empresas/${id}`);
  });

  test('ADM-04 editar un proceso auxiliar INACTIVO conserva su estado (bug legacy corregido)', async ({ page }) => {
    const num = `9${uniq()}`;
    const r = await page.request.post(`${API}/procesos_auxiliares`, { data: { numero: num, detalle: `OBRA E2E ${num}`, auxiliar: `AX${num}`, estado: 'INACTIVO' } });
    expect(r.status(), await r.text()).toBe(200);
    const id = (await r.json()).data.id;
    await openTab(page, 'obras');
    const row = page.locator('#tablaAdminObras tr', { hasText: `OBRA E2E ${num}` });
    await row.getByRole('button', { name: /^Editar/ }).click();
    await expect(page.locator('#adminObraEstado')).toHaveValue(/INACTIVO/i);
    await page.getByTestId('admin-modal-save').click();
    await toast(page, 'success', 'Proceso Auxiliar actualizado exitosamente');
    const after = ((await (await page.request.get(`${API}/procesos_auxiliares`)).json()).data as Array<{ id: number; estado: string }>).find((o) => o.id === id);
    expect(after?.estado).toBe('INACTIVO');
    await page.request.delete(`${API}/procesos_auxiliares/${id}`);
  });

  test('ADM-05 Usuario: RUT inválido se rechaza en cliente; alta → contraseña temporal → correo real → primer login funciona', async ({ page, browser, net }) => {
    const n = uniq();
    const email = `e2e.alta.${n}@flujopago.cl`;
    await openTab(page, 'usuarios');
    await page.getByTestId('admin-new-usuario').click();
    await page.locator('#adminUsuarioNombre').fill('Alta');
    await page.locator('#adminUsuarioApellidoPaterno').fill('Prueba');
    await page.locator('#adminUsuarioEmail').fill(email);
    await page.locator('#adminUsuarioRut').fill('123456789'); // sin guion → inválido
    await page.locator('#adminUsuarioRol').selectOption({ label: 'Solicitante' });
    await page.locator('#adminUsuarioObras input[type="checkbox"]').first().check();
    await page.getByTestId('admin-modal-save').click();
    await toast(page, 'error', 'El RUT ingresado no es válido. Formato requerido: 12345678-9');
    expect(net.filter((x) => x.method === 'POST' && x.url.endsWith('/usuarios'))).toHaveLength(0);

    await page.locator('#adminUsuarioRut').fill(`${n}00-1`);
    await page.getByTestId('admin-modal-save').click();
    await expect(page.locator('#tempPasswordModal')).toBeVisible(); // legacy: muestra el modal con la contraseña temporal
    await expect(page.locator('#tempPasswordModal')).toContainText(email);
    const temp = (await page.locator('#tempPassValue').textContent())!.trim();
    expect(temp.length).toBeGreaterThanOrEqual(8);

    const since = Date.now();
    await page.locator('#sendTempPasswordBtn').click();
    await toast(page, 'success', `Contraseña temporal enviada a ${email}`);
    const mail = await latestMessageFor(email, since);
    expect(mail).toContain(temp);

    // El usuario nuevo puede iniciar sesión con la contraseña temporal → cambio obligatorio
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p2 = await ctx.newPage();
    await p2.goto(`${APP}/login`);
    await p2.locator('#email').fill(email);
    await p2.locator('#password').fill(temp);
    await p2.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await expect(p2).toHaveURL(/\/app\/force-change$/);
    await ctx.close();

    // Eliminación desde la UI
    await page.locator('#tempPasswordModal').getByRole('button', { name: /Cerrar|Entendido|Listo/ }).first().click();
    const row = page.locator('#tablaAdminUsuarios tr', { hasText: email });
    await row.getByRole('button', { name: /Eliminar/ }).click();
    await page.locator('#modalConfirmBtn').click();
    await toast(page, 'success', 'Usuario eliminado exitosamente');
    await expect(row).toHaveCount(0);
  });

  test('ADM-06 el administrador no puede eliminarse a sí mismo', async ({ page }) => {
    await openTab(page, 'usuarios');
    const me = page.locator('#tablaAdminUsuarios tr', { hasText: '(Tú)' });
    await expect(me).toBeVisible();
    await expect(me.getByRole('button', { name: /No puede eliminar su propio usuario/ })).toBeDisabled();
  });
});
