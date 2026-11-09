import { test, expect } from '../helpers/fixtures';
import { storage } from '../helpers/state';
import type { Page } from '@playwright/test';

/**
 * Responsive: misma interfaz adaptándose (no una versión móvil distinta).
 * Para cada resolución y vista: sin scroll horizontal de página, contenido principal visible,
 * tablas con scroll interno, modales dentro del viewport. Capturas guardadas como evidencia.
 */
const VIEWPORTS = [
  { name: 'movil-pequeno-320', width: 320, height: 568 },
  { name: 'movil-grande-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'notebook-1366', width: 1366, height: 768 },
  { name: 'fullhd-1920', width: 1920, height: 1080 },
  { name: '2k-2560', width: 2560, height: 1440 },
  { name: '4k-3840', width: 3840, height: 2160 },
];
/** Anchos ENTRE breakpoints y orientación horizontal: aquí aparecían los desbordes de pies de tarjeta y reportes. */
const INTERMEDIATE = [
  { name: 'movil-360', width: 360, height: 740 },
  { name: 'movil-horizontal-844', width: 844, height: 390 },
  { name: 'tablet-900', width: 900, height: 1200 },
  { name: 'laptop-1100', width: 1100, height: 800 },
  { name: 'laptop-1180', width: 1180, height: 820 },
  { name: 'desktop-1536', width: 1536, height: 864 },
];
const VIEWS = ['', 'nueva-solicitud', 'mis-solicitudes', 'aprobaciones', 'finanzas', 'todas-solicitudes', 'recepcionado', 'reportes', 'administracion', 'seguridad'];

async function noHorizontalOverflow(page: Page, where: string) {
  const { sw, iw, offenders } = await page.evaluate(() => {
    const iw = window.innerWidth;
    const offenders: string[] = [];
    // ¿Algún ancestro (distinto de html/body) recorta el contenido y está dentro del viewport? → no es desborde visible.
    const clipped = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox !== 'visible' && a.getBoundingClientRect().right <= iw + 1) return true;
      }
      return false;
    };
    document.querySelectorAll('body *').forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.right > iw + 1 && !clipped(el) && !(el as HTMLElement).closest('#sidebar, #notificationContainer')) {
        offenders.push(`${el.tagName.toLowerCase()}#${el.id}.${String((el as HTMLElement).className).slice(0, 40)}`);
      }
    });
    return { sw: document.scrollingElement!.scrollWidth, iw, offenders: offenders.slice(0, 5) };
  });
  expect(sw, `scroll horizontal en ${where}: ${offenders.join(' | ')}`).toBeLessThanOrEqual(iw + 1);
  // Además se exige que ningún elemento quede cortado fuera del viewport.
  expect(offenders, `elementos fuera del viewport en ${where}`).toEqual([]);
  // Controles recortados DENTRO de su tarjeta (las tarjetas usan overflow:hidden para las esquinas y lo ocultaban).
  const clippedInCard = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('.ui-card button, .ui-card select, .ui-card input:not([type=checkbox]):not([type=radio]):not([type=file])').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest('.table-accordion-wrapper.collapsed')) return;
      // Dentro de un contenedor con scroll horizontal propio (tablas) el recorte es intencional.
      for (let a = el.parentElement; a && !a.classList.contains('ui-card'); a = a.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(a).overflowX)) return;
      }
      const card = el.closest('.ui-card')!.getBoundingClientRect();
      if (r.right > card.right + 1 || r.left < card.left - 1) out.push(`${el.tagName.toLowerCase()}#${el.id} "${(el as HTMLElement).innerText?.trim().slice(0, 30)}"`);
      // Texto que no cabe en su propio botón
      if (el.tagName === 'BUTTON' && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1) out.push(`texto desborda button#${el.id} "${(el as HTMLElement).innerText?.trim().slice(0, 30)}" ${(el as HTMLElement).className.slice(0, 60)}`);
    });
    return out.slice(0, 5);
  });
  expect(clippedInCard, `controles recortados en ${where}`).toEqual([]);
}

test.describe('Responsive (admin, todas las vistas)', () => {
  test.use({ storageState: storage('admin') });
  for (const vp of VIEWPORTS) {
    test(`RESP-${vp.name} sin desbordes en ${VIEWS.length} vistas`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const v of VIEWS) {
        await page.goto(v);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#mainContent')).toBeVisible();
        await noHorizontalOverflow(page, `${vp.name}/${v || 'dashboard'}`);
      }
      await page.goto('');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `e2e/.output/screens/${vp.name}-dashboard.png`, fullPage: false });
      await page.goto('todas-solicitudes');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `e2e/.output/screens/${vp.name}-todas.png`, fullPage: false });

      if (vp.width < 1024) {
        // Menú off-canvas: abre con hamburguesa, navega y se cierra solo (bug legacy: la navegación lo re-abría)
        await expect(page.locator('#sidebarToggle')).toBeVisible();
        await page.locator('#sidebarToggle').click();
        await expect(page.locator('#sidebar')).toHaveClass(/translate-x-0/);
        await page.locator('#sidebar').getByRole('link', { name: 'Seguridad' }).click();
        await expect(page).toHaveURL(/seguridad$/);
        await expect(page.locator('#sidebar')).toHaveClass(/-translate-x-full/);
        await expect(page.locator('#sidebarOverlay')).toHaveCount(0);
      } else {
        await expect(page.locator('#sidebarToggle')).toBeHidden();
        await expect(page.locator('#sidebar')).toBeInViewport();
      }
    });
  }

  for (const vp of INTERMEDIATE) {
    test(`RESP-${vp.name} (entre breakpoints) sin desbordes en ${VIEWS.length} vistas`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const v of VIEWS) {
        await page.goto(v);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#mainContent')).toBeVisible();
        await noHorizontalOverflow(page, `${vp.name}/${v || 'dashboard'}`);
      }
    });
  }

  test('RESP-escala: la tipografía crece en 2K/4K y se mantiene en Full HD @responsive', async ({ page }) => {
    const rootPx = async (w: number, h: number) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('');
      return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    };
    expect(await rootPx(1366, 768)).toBe(16);
    expect(await rootPx(1920, 1080)).toBe(16);
    expect(await rootPx(2560, 1440)).toBeGreaterThan(17);
    expect(await rootPx(3840, 2160)).toBeGreaterThan(21);
  });

  test('RESP-modales: detalle y formulario caben en 320px y 4K @responsive', async ({ page }) => {
    for (const vp of [VIEWPORTS[0], VIEWPORTS[6]]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('todas-solicitudes');
      const firstRow = page.locator('#tablaTodasSolicitudes tr').first();
      await expect(firstRow).toBeVisible();
      await firstRow.locator('button').first().click();
      const box = await page.getByTestId('detail-modal').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
      expect(box!.height).toBeLessThanOrEqual(vp.height + 1);
      // Nada se superpone al encabezado del modal (regresión: el botón de menú z-90 del CSS legacy lo tapaba)
      const panel = (await page.getByTestId('detail-modal').locator('> *').first().boundingBox())!;
      expect(panel.x + panel.width).toBeLessThanOrEqual(vp.width + 1);
      const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="detail-modal"] > *'), [panel.x + 30, panel.y + 30]);
      expect(onTop).toBe(true);
      await page.screenshot({ path: `e2e/.output/screens/${vp.name}-detalle.png` });
      await page.keyboard.press('Escape');
    }
  });
});

test('RESP-login en móvil pequeño y 4K @responsive @compat', async ({ page }) => {
  for (const vp of [VIEWPORTS[0], VIEWPORTS[6]]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('login');
    const btn = page.getByRole('button', { name: /Ingresar al Sistema/ });
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeInViewport();
    const bb = (await btn.boundingBox())!;
    expect(bb.x + bb.width).toBeLessThanOrEqual(vp.width); // no cortado horizontalmente
    await noHorizontalOverflow(page, `${vp.name}/login`);
    await page.screenshot({ path: `e2e/.output/screens/${vp.name}-login.png` });
  }
});

test.describe('Dispositivo móvil real (emulación táctil)', () => {
  test.use({ storageState: storage('solicitante') });
  test('RESP-touch: menú, navegación y formulario de Nueva Solicitud usables en móvil @responsive', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Solo en proyectos de dispositivo móvil (pantalla táctil)');
    await page.goto('');
    await page.locator('#sidebarToggle').tap();
    await page.locator('#sidebar').getByRole('link', { name: 'Nueva Solicitud' }).tap();
    await expect(page).toHaveURL(/nueva-solicitud$/);
    await expect(page.locator('#sidebar')).toHaveClass(/-translate-x-full/);
    await page.locator('#mesProceso').selectOption('NOVIEMBRE');
    await expect(page.getByTestId('validar-previsualizar')).toBeVisible();
    await noHorizontalOverflow(page, 'touch/nueva-solicitud');
  });
});
