import { test, expect, toast } from '../helpers/fixtures';
import { state, storage } from '../helpers/state';
import { freshTotp, secretFromUri } from '../helpers/totp';
import { latestMessageFor, extractOtp } from '../helpers/mailpit';
import { API, ADMIN } from '../helpers/env';

const fill = async (page: import('@playwright/test').Page, email: string, password: string) => {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
};

test.describe('Autenticación (UI → API → BD → UI)', () => {
  test('AUTH-01 campos vacíos y dominio inválido se validan en cliente sin llamar a la API @compat', async ({ page, net }) => {
    await page.goto('login');
    await expect(page).toHaveTitle('FlujoPago - Gestión de Pagos');
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await toast(page, 'error', 'Por favor complete todos los campos');
    await fill(page, 'alguien@otrodominio.com', 'x');
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await toast(page, 'error', 'Por favor ingrese un email válido (@flujopago.cl o @grupodemo.cl)');
    await expect(page.locator('#email')).toBeFocused();
    expect(net.filter((n) => n.url.endsWith('/login') && n.method === 'POST')).toHaveLength(0);
  });

  test('AUTH-02 contraseña incorrecta → 401 con mensaje del backend', async ({ page }) => {
    await page.goto('login');
    await fill(page, ADMIN.email, 'ClaveIncorrecta#1');
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await toast(page, 'error', 'Error de Credenciales: Email o contraseña incorrectos');
    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test('AUTH-03 email no registrado → 404 con mensaje del backend', async ({ page }) => {
    await page.goto('login');
    await fill(page, `noexiste.${Date.now()}@flujopago.cl`, 'Cualquiera#1');
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await toast(page, 'error', 'El email ingresado no está registrado en el sistema');
  });

  test('AUTH-04 bloqueo por intentos (429) tras 5 fallos', async ({ page }) => {
    const email = `bloqueo.${Date.now()}@flujopago.cl`;
    await page.goto('login');
    for (let i = 0; i < 5; i++) {
      await fill(page, email, `Mala#${i}`);
      const resp = page.waitForResponse((r) => r.url().endsWith('/login') && r.request().method() === 'POST');
      await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
      expect((await resp).status()).toBe(404);
    }
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await toast(page, 'error', 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.');
  });

  test('AUTH-05 primer ingreso completo: contraseña temporal → cambio forzado → configuración 2FA → dashboard', async ({ page, context }) => {
    const u = state().users.uiflow;
    await page.goto('login');
    await fill(page, u.email, u.tempPassword!);
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await expect(page).toHaveURL(/\/app\/force-change$/);

    // No coinciden (cliente)
    await page.locator('#old_password').fill(u.tempPassword!);
    await page.locator('#new_password').fill('Nueva#Clave1');
    await page.locator('#confirm_password').fill('Otra#Clave1');
    await page.getByRole('button', { name: /Guardar y Continuar/ }).click();
    await toast(page, 'error', 'Las contraseñas no coinciden');

    // Débil → 422 del backend con la regla concreta
    await page.locator('#new_password').fill('debil');
    await page.locator('#confirm_password').fill('debil');
    await page.getByRole('button', { name: /Guardar y Continuar/ }).click();
    await toast(page, 'error', /al menos 8 caracteres/);

    // Contraseña actual incorrecta → error de negocio (HTTP 200 + status:error)
    await page.locator('#old_password').fill('NoEsLaTemporal#1');
    await page.locator('#new_password').fill(u.password);
    await page.locator('#confirm_password').fill(u.password);
    await page.getByRole('button', { name: /Guardar y Continuar/ }).click();
    await toast(page, 'error', 'La contraseña actual es incorrecta.');

    await page.locator('#old_password').fill(u.tempPassword!);
    await page.getByRole('button', { name: /Guardar y Continuar/ }).click();
    await toast(page, 'success', 'Contraseña actualizada exitosamente');

    // 2FA: setup con QR + 10 códigos de respaldo
    const setupResp = page.waitForResponse((r) => r.url().endsWith('/mfa/setup'));
    await expect(page).toHaveURL(/\/app\/mfa$/);
    const setup = await (await setupResp).json();
    const secret = secretFromUri(setup.data.provisioning_uri);
    await expect(page.locator('#qrCodeImg')).toBeVisible();
    await expect(page.locator('#backupCodesList p')).toHaveCount(10);
    // Solo UNA llamada a setup (cada llamada regenera el secreto en el backend)
    await page.waitForTimeout(500);

    await page.locator('#setupCode').fill('000000');
    await page.getByRole('button', { name: 'Activar 2FA' }).click();
    await toast(page, 'error', 'Código inválido.');

    await page.locator('#setupCode').fill(await freshTotp(secret));
    await page.getByRole('button', { name: 'Activar 2FA' }).click();
    await toast(page, 'success', '2FA activado y verificado correctamente');
    await expect(page).toHaveURL(/\/app\/?$/);
    await expect(page.locator('#currentUserName')).toHaveText(/PRUEBAUIFLOW/);
    await expect(page.locator('#currentUserRole')).toHaveText('Solicitante');

    // Seguridad: el token NO queda expuesto a JavaScript
    const storageDump = await page.evaluate(() => JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage }));
    expect(storageDump).not.toContain('eyJ'); // ningún JWT en web storage
    const cookie = (await context.cookies()).find((c) => c.name === 'access_token');
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('access_token');

    // Persistir para AUTH-07 (códigos de respaldo)
    test.info().annotations.push({ type: 'backup', description: setup.data.backup_codes[0] });
    process.env.E2E_UIFLOW_BACKUP = setup.data.backup_codes[0];
    process.env.E2E_UIFLOW_SECRET = secret;
  });

  test('AUTH-06 código de respaldo permite ingresar (y no puede reutilizarse)', async ({ page }) => {
    const u = state().users.uiflow;
    const backup = process.env.E2E_UIFLOW_BACKUP;
    test.skip(!backup, 'Depende de AUTH-05');
    await page.goto('login');
    await fill(page, u.email, u.password);
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await expect(page).toHaveURL(/\/app\/mfa$/);
    await expect(page.locator('#mfa-subtitle')).toHaveText('Ingresa tu código TOTP o solicita uno por correo');
    await page.getByRole('button', { name: /Usar código de recuperación/ }).click();
    await page.locator('#verifyBackupCode').fill(backup!);
    await page.getByRole('button', { name: 'Ingresar con Respaldo' }).click();
    await toast(page, 'success', 'Ingreso de emergencia exitoso');
    await expect(page).toHaveURL(/\/app\/?$/);
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/app\/login$/);
    // reutilizar el mismo código debe fallar
    await fill(page, u.email, u.password);
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await page.getByRole('button', { name: /Usar código de recuperación/ }).click();
    await page.locator('#verifyBackupCode').fill(backup!);
    await page.getByRole('button', { name: 'Ingresar con Respaldo' }).click();
    await toast(page, 'error', 'Código de respaldo inválido o ya utilizado.');
  });

  test('AUTH-07 OTP por correo real (SMTP → Mailpit) verifica identidad @compat', async ({ page }) => {
    const u = state().users.rrhh;
    await page.goto('login');
    await fill(page, u.email, u.password);
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await expect(page).toHaveURL(/\/app\/mfa$/);
    const since = Date.now();
    await page.getByRole('button', { name: /Enviar código por Correo/ }).click();
    const sent = page.getByTestId('toast-success').filter({ hasText: /Código enviado exitosamente a/ }).first();
    const limited = page.getByTestId('toast-error').filter({ hasText: /Espere un minuto/ }).first();
    await expect(sent.or(limited)).toBeVisible();
    test.skip(await limited.isVisible(), 'Rate limit de OTP por correo (60s) activo en este navegador; cubierto en chromium');
    await expect(page.locator('label[for="verifyCode"]')).toHaveText('Ingresa el código de App o Correo');
    const otp = extractOtp(await latestMessageFor(u.email, since));
    await page.locator('#verifyCode').fill(otp);
    await page.getByRole('button', { name: /Validar Identidad/ }).click();
    await toast(page, 'success', 'Identidad verificada correctamente');
    await expect(page).toHaveURL(/\/app\/?$/);
  });

  test('AUTH-08 "Confiar en este dispositivo" omite 2FA en el siguiente ingreso', async ({ page }) => {
    const u = state().users.scp;
    await page.goto('login');
    await fill(page, u.email, u.password);
    await page.locator('label:has(#remember_device)').click();
    await expect(page.locator('#remember_device')).toBeChecked();
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await expect(page).toHaveURL(/\/app\/mfa$/);
    await page.locator('#verifyCode').fill(await freshTotp(u.secret!));
    await page.getByRole('button', { name: /Validar Identidad/ }).click();
    await expect(page).toHaveURL(/\/app\/?$/);
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/app\/login$/);
    await fill(page, u.email, u.password);
    await page.getByRole('button', { name: /Ingresar al Sistema/ }).click();
    await expect(page).toHaveURL(/\/app\/?$/); // sin pasar por /mfa
    // El dispositivo aparece en Seguridad y puede revocarse
    await page.getByRole('link', { name: 'Seguridad' }).click();
    await expect(page.locator('#devicesTableBody tr')).toHaveCount(1);
    await page.getByRole('button', { name: /Revocar/ }).first().click();
    await page.locator('#modalConfirmBtn').click();
    await toast(page, 'success', 'Dispositivo revocado correctamente.');
    await expect(page.locator('#devicesEmpty')).toBeVisible();
  });
});

test.describe('Sesión, logout y rutas protegidas', () => {
  test('AUTH-09 rutas protegidas sin sesión redirigen a login @compat', async ({ page }) => {
    for (const p of ['', 'administracion', 'finanzas', 'seguridad']) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/app\/login$/);
    }
    // URLs del frontend original redirigen a la SPA (cutover)
    await page.goto(`${API}/`);
    await expect(page).toHaveURL(/\/app\/login/);
    await page.goto(`${API}/dashboard`);
    await expect(page).toHaveURL(/\/app\/login\?error=session_expired/);
    await toast(page, 'error', 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.');
  });

  test.describe('con sesión de Solicitante', () => {
    test.use({ storageState: storage('solicitante') });
    test('AUTH-10 permisos: menú por rol y secciones no autorizadas bloqueadas (UI y API)', async ({ page }) => {
      await page.goto('');
      const menu = page.locator('#sidebar');
      for (const visible of ['Dashboard', 'Nueva Solicitud', 'Mis Solicitudes', 'Estados de Solicitudes', 'Solicitudes Recepcionadas', 'Seguridad']) {
        await expect(menu.getByRole('link', { name: visible })).toBeVisible();
      }
      for (const hidden of ['Aprobación RRHH', 'Aprobación SCP', 'Finanzas', 'Reportes', 'Administración']) {
        await expect(menu.getByRole('link', { name: hidden })).toHaveCount(0);
      }
      await page.goto('administracion');
      await expect(page).toHaveURL(/\/app\/?$/);
      // El backend también rechaza la acción (403) — la seguridad no depende solo de la UI
      const r = await page.request.post(`${API}/usuarios`, { data: { cargo: 'Administrador', nombre_1: 'X', apellido_1: 'Y', email: 'x@flujopago.cl', rol_id: 1, rut: '1-1' } });
      expect(r.status()).toBe(403);
    });

    test('AUTH-11 logout limpia la sesión y el botón atrás no muestra datos', async ({ page, context }) => {
      await page.goto('');
      await page.locator('#sidebar').getByRole('link', { name: 'Seguridad' }).click();
      await expect(page.locator('#sectionSeguridad')).toBeVisible();
      await page.getByTestId('logout').click();
      await expect(page).toHaveURL(/\/app\/login$/);
      expect((await context.cookies()).find((c) => c.name === 'access_token')).toBeUndefined();
      await page.goBack(); // vuelve a /app (dashboard) en el historial → la guarda redirige a login
      await expect(page).toHaveURL(/\/app\/login$/);
      await expect(page.locator('#sectionSeguridad')).toHaveCount(0);
      // Recargar tampoco recupera la sesión (cookie eliminada en el servidor)
      await page.goto('seguridad');
      await expect(page).toHaveURL(/\/app\/login$/);
    });
  });

  test.describe('sesión expirada', () => {
    test.use({ storageState: storage('rrhh') });
    test('AUTH-12 cookie inválida/expirada → 401 → login con aviso de sesión expirada', async ({ page, context }) => {
      await page.goto('');
      await expect(page.locator('#currentUserName')).not.toBeEmpty();
      const c = (await context.cookies()).find((x) => x.name === 'access_token')!;
      await context.addCookies([{ ...c, value: `${c.value.slice(0, -4)}AAAA` }]); // firma inválida = token rechazado
      await page.getByRole('link', { name: 'Seguridad' }).click(); // dispara GET /mfa/devices con el token inválido
      await expect(page).toHaveURL(/\/app\/login\?error=session_expired/);
      await toast(page, 'error', 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.');
    });
  });

  test('AUTH-13 sesión sin 2FA completado no accede al dashboard', async ({ page }) => {
    const u = state().users.finanzas;
    const r = await page.request.post(`${API}/login`, { data: { email: u.email, password: u.password, remember_device: false } });
    expect(r.status()).toBe(200);
    await page.goto('');
    await expect(page).toHaveURL(/\/app\/mfa$/);
    const api = await page.request.get(`${API}/todas_solicitudes`);
    expect(api.status()).toBe(403);
  });
});
