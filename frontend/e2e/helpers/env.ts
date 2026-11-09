import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const BASE = process.env.FLUJOPAGO_E2E_BASE ?? 'http://localhost:8001';
export const API = `${BASE}/flujopago/gestion-pagos/v1`;
export const APP = `${API}/app`;
export const MAILPIT = process.env.FLUJOPAGO_E2E_MAILPIT ?? 'http://localhost:58025';
export const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../.output');
export const ADMIN = { email: 'super_admin@flujopago.cl', password: '@Admin_Flujo2026' };
export const NEW_PASSWORD = 'NuevaClave#2026';
