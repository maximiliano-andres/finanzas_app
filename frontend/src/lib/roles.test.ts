import { describe, expect, it } from 'vitest';
import { isHighVisibility, isOwner, toCurrentUser, visibleSections } from './roles';

const u = (rol: string, cargo = '') => ({ rol, cargo });
const keys = (s: Set<string>) => [...s].sort();

describe('visibleSections — réplica exacta de setupMenuByRole (app.js:534-593)', () => {
  it('Administrador ve todo', () => {
    expect(keys(visibleSections(u('Administrador')))).toEqual(keys(new Set(['dashboard', 'misSolicitudes', 'recepcionado', 'seguridad', 'nuevaSolicitud', 'aprobaciones', 'aprobaciones2', 'finanzas', 'todasSolicitudes', 'reportes', 'administracion'])));
  });
  it('Solicitante: nueva solicitud + estados', () => {
    expect(keys(visibleSections(u('Solicitante', 'Analista de personal')))).toEqual(['dashboard', 'misSolicitudes', 'nuevaSolicitud', 'recepcionado', 'seguridad', 'todasSolicitudes']);
  });
  it('Aprobador según cargo', () => {
    expect(visibleSections(u('Aprobador', 'Jefe de Recursos Humanos')).has('aprobaciones')).toBe(true);
    expect(visibleSections(u('Aprobador', 'Jefe de Recursos Humanos')).has('nuevaSolicitud')).toBe(true);
    expect(visibleSections(u('Aprobador', 'Subgerente de Capital Humano')).has('aprobaciones2')).toBe(true);
    expect(visibleSections(u('Aprobador', 'Subgerente de Capital Humano')).has('aprobaciones')).toBe(false);
    expect(keys(visibleSections(u('Aprobador', 'Otro')))).toEqual(['dashboard', 'misSolicitudes', 'recepcionado', 'seguridad']);
  });
  it('Finanzas por rol o por cargo (rama else-if, como el original)', () => {
    expect(visibleSections(u('Responsable Finanzas', 'Jefe de Finanzas')).has('finanzas')).toBe(true);
    expect(visibleSections(u('Responsable Finanzas', 'Jefe de Finanzas')).has('reportes')).toBe(true);
    // cargo Jefe de Finanzas con rol Solicitante: la rama Solicitante gana (comportamiento legacy)
    expect(visibleSections(u('Solicitante', 'Jefe de Finanzas')).has('finanzas')).toBe(false);
  });
  it('nunca muestra Administración a no administradores', () => {
    for (const r of ['Solicitante', 'Aprobador', 'Responsable Finanzas', '']) expect(visibleSections(u(r, 'Jefe de Finanzas')).has('administracion')).toBe(false);
  });
});

describe('isHighVisibility / isOwner', () => {
  it('roles y cargos de alta visibilidad', () => {
    expect(isHighVisibility(u('Administrador'))).toBe(true);
    expect(isHighVisibility(u('Aprobador', 'Jefe de Recursos Humanos'))).toBe(true);
    expect(isHighVisibility(u('Responsable Finanzas', ''))).toBe(true);
    expect(isHighVisibility(u('Solicitante', 'Analista de personal'))).toBe(false);
  });
  it('dueño por id o por nombre (case-insensitive)', () => {
    const user = toCurrentUser({ sub: '7', email: 'a@flujopago.cl', primer_nombre: 'Ana', primer_apellido: 'Paz' });
    expect(user.nombre).toBe('Ana  Paz'); // mismo armado que el original (espacios por campos vacíos)
    expect(isOwner({ solicitanteId: 7 }, user)).toBe(true);
    expect(isOwner({ solicitanteId: 8, solicitanteNombre: 'ana  paz' }, user)).toBe(true);
    expect(isOwner({ solicitanteId: 8, solicitanteNombre: 'Otro' }, user)).toBe(false);
  });
});
