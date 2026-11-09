/// <reference types="vitest/config" />
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// La SPA se sirve desde FastAPI bajo este prefijo (mismo origen => cookies httpOnly funcionan sin CORS).
export const APP_BASE = '/flujopago/gestion-pagos/v1/app/';
// Backend de desarrollo (docker-compose.yml expone FastAPI en :8000). Para otro backend: FLUJOPAGO_BACKEND_URL=http://host:puerto npm run dev
const BACKEND = process.env.FLUJOPAGO_BACKEND_URL ?? 'http://localhost:8000';

/** Dev/preview: `/…/app` (sin barra final) → 301 a `/…/app/`. Vite solo sirve la SPA bajo la base exacta con barra. */
function baseSlashRedirect(): Plugin {
  const bare = APP_BASE.slice(0, -1);
  const mw: Connect.NextHandleFunction = (req, res, next) => {
    const [path, query] = (req.url ?? '').split(/\?(.*)/s, 2);
    if (path !== bare) return next();
    res.statusCode = 301;
    res.setHeader('Location', APP_BASE + (query ? `?${query}` : ''));
    res.end();
  };
  return {
    name: 'base-slash-redirect',
    configureServer: (server) => { server.middlewares.use(mw); },
    configurePreviewServer: (server) => { server.middlewares.use(mw); },
  };
}

export default defineConfig({
  base: APP_BASE,
  plugins: [react(), baseSlashRedirect()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 900, // xlsx-js-style (~860 kB) se carga solo al exportar (import dinámico)
  },
  server: {
    port: 5173,
    // En desarrollo se proxifica la API al backend real para mantener mismo origen.
    proxy: {
      // `app` también sin barra final o con query (`/v1/app`, `/v1/app?x`): si no, se proxificaba al backend, que devolvía
      // el index.html compilado de dist/ y sus bundles con hash daban 404 en el servidor de desarrollo.
      '^/flujopago/gestion-pagos/v1/(?!app(?:[/?#]|$))': { target: BACKEND, changeOrigin: false },
      '/public': { target: BACKEND },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
