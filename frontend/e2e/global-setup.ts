import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiSession } from './helpers/api';
import { ADMIN, NEW_PASSWORD, OUT } from './helpers/env';

/**
 * Prepara datos REALES en el backend E2E (sin mocks):
 *  - Admin con 2FA configurado (secreto TOTP persistido en .output/state.json).
 *  - Un usuario nuevo por rol (contraseña temporal → cambio forzado → 2FA), con sesión guardada.
 *  - Un usuario "uiflow" que queda con contraseña temporal para probar el flujo completo desde la UI.
 */
export interface E2EState {
  adminSecret: string;
  runId: string;
  users: Record<string, { email: string; password: string; secret?: string; tempPassword?: string; id: number; rol: string; cargo: string }>;
}

const ROLE_USERS = [
  { key: 'solicitante', rol_id: 2, rol: 'Solicitante', cargo: 'Analista de personal' },
  { key: 'rrhh', rol_id: 3, rol: 'Aprobador', cargo: 'Jefe de Recursos Humanos' },
  { key: 'scp', rol_id: 3, rol: 'Aprobador', cargo: 'Subgerente de Capital Humano' },
  { key: 'finanzas', rol_id: 4, rol: 'Responsable Finanzas', cargo: 'Jefe de Finanzas' },
] as const;

export default async function globalSetup() {
  mkdirSync(OUT, { recursive: true });
  const statePath = join(OUT, 'state.json');
  const prev: Partial<E2EState> = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const runId = String(Date.now()).slice(-7);
  const runTag = runId.replace(/\d/g, (d) => 'abcdefghij'[Number(d)]); // los nombres no admiten dígitos

  // --- Admin ---
  const admin = await ApiSession.create();
  await admin.login(ADMIN.email, ADMIN.password);
  const adminSecret = await admin.completeMfa(prev.adminSecret);
  // Persistir el secreto inmediatamente: si algo falla después, el siguiente run puede reutilizarlo.
  writeFileSync(statePath, JSON.stringify({ ...prev, adminSecret }, null, 2));
  await admin.ctx.storageState({ path: join(OUT, 'admin.json') });

  const obras = (await admin.json('GET', '/procesos_auxiliares')).body.data as Array<{ id: number }>;
  const obrasIds = obras.map((o) => o.id);

  const users: E2EState['users'] = {};
  const create = async (key: string, rol_id: number, cargo: string, n: number) => {
    const email = `e2e.${key}.${runId}@flujopago.cl`;
    const r = await admin.json('POST', '/usuarios', {
      cargo, nombre_1: `Prueba${key.charAt(0).toUpperCase()}${key.slice(1)}`, apellido_1: `Prueba${runTag}`, email, rol_id,
      rut: `${runId}${n}-${n}`, obras_ids: obrasIds,
    });
    if (r.status !== 200) throw new Error(`crear usuario ${key}: ${r.status} ${JSON.stringify(r.body)}`);
    return { email, id: r.body.data.id as number, temp: r.body.data.temp_password as string };
  };

  let n = 1;
  for (const u of ROLE_USERS) {
    const c = await create(u.key, u.rol_id, u.cargo, n++);
    const s = await ApiSession.create();
    await s.login(c.email, c.temp);
    await s.forceChange(c.temp, NEW_PASSWORD);
    await s.login(c.email, NEW_PASSWORD);
    const secret = await s.completeMfa();
    await s.ctx.storageState({ path: join(OUT, `${u.key}.json`) });
    await s.dispose();
    users[u.key] = { email: c.email, password: NEW_PASSWORD, secret, id: c.id, rol: u.rol, cargo: u.cargo };
  }
  const ui = await create('uiflow', 2, 'Analista de personal', n);
  users.uiflow = { email: ui.email, password: NEW_PASSWORD, tempPassword: ui.temp, id: ui.id, rol: 'Solicitante', cargo: 'Analista de personal' };

  await admin.dispose();
  writeFileSync(statePath, JSON.stringify({ adminSecret, runId, users } satisfies E2EState, null, 2));
}
