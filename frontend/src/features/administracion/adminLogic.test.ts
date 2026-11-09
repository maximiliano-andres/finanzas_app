import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import {
  FIELD_MAP, ROLE_IDS, ROLES, buildUsuarioPayload, cargosForRol, estadoBadgeClass, estadoSelectValue, getRoleBadgeClass,
  mapUsuarioRow, parseMutationError, resolveCargo, resolveRol, rewriteEmpresaError, simpleErrorMessage, validateRUT,
  validateUsuario, type UsuarioForm,
} from './adminLogic';

const http = (status: number, body: Record<string, unknown>, message = 'msg') =>
  new ApiError('http', status, message, { status: 'error', code: status, ...body });

describe('roles y cargos', () => {
  it('mapa rol→cargos y ids del original', () => {
    expect(ROLES).toEqual(['Administrador', 'Solicitante', 'Aprobador', 'Responsable Finanzas']);
    expect(cargosForRol('Administrador')).toEqual(['Jefe de Recursos Humanos', 'Subgerente de Capital Humano', 'Administrador']);
    expect(cargosForRol('Solicitante')).toEqual(['Analista de personal', 'Jefe de Recursos Humanos']);
    expect(cargosForRol('Aprobador')).toEqual(['Subgerente de Capital Humano', 'Jefe de Recursos Humanos']);
    expect(cargosForRol('Responsable Finanzas')).toEqual(['Jefe de Finanzas']);
    expect(cargosForRol('Otro')).toEqual([]);
    expect(ROLE_IDS).toEqual({ Administrador: 1, Solicitante: 2, Aprobador: 3, 'Responsable Finanzas': 4 });
  });
  it('cargo fuera del rol → primera opción; rol desconocido → Administrador', () => {
    expect(resolveCargo('Solicitante', 'Jefe de Recursos Humanos')).toBe('Jefe de Recursos Humanos');
    expect(resolveCargo('Solicitante', 'Jefe de Finanzas')).toBe('Analista de personal');
    expect(resolveCargo('X', 'Y')).toBe('');
    expect(resolveRol('Desconocido')).toBe('Administrador');
    expect(resolveRol('Aprobador')).toBe('Aprobador');
  });
  it('badges', () => {
    expect(getRoleBadgeClass('Responsable Finanzas')).toBe('badge-role-finanzas');
    expect(getRoleBadgeClass('Supervisor')).toBe('badge-approved');
    expect(estadoBadgeClass('ACTIVO')).toBe('badge-approved');
    expect(estadoBadgeClass('INACTIVO')).toBe('badge-pending');
    expect(estadoBadgeClass(null)).toBe('badge-pending');
  });
});

describe('estadoSelectValue (fix preselección)', () => {
  it('INACTIVO del backend preselecciona Inactivo', () => {
    expect(estadoSelectValue('INACTIVO')).toBe('Inactivo');
    expect(estadoSelectValue('Inactivo')).toBe('Inactivo');
    expect(estadoSelectValue('ACTIVO')).toBe('Activo');
    expect(estadoSelectValue(undefined)).toBe('Activo');
  });
});

describe('usuarios', () => {
  const base: UsuarioForm = {
    nombre1: ' Ana ', nombre2: '', apellido1: 'Pérez', apellido2: ' ', rut: '12345678-9', email: 'ana@flujopago.cl',
    rol: 'Solicitante', cargo: 'Analista de personal', obrasIds: [3, 5],
  };
  it('mapUsuarioRow', () => {
    const r = mapUsuarioRow({ id: 1, cargo: 'Administrador', nombre_1: 'ana', apellido_1: 'paz', email: 'ana.paz@flujopago.cl', rol_id: 1, rut: '1-1' });
    expect(r).toMatchObject({ nombre: 'ana paz', username: 'ana.paz', rol: 'Desconocido' });
  });
  it('validación en orden del original', () => {
    expect(validateUsuario({ ...base, nombre1: ' ' })).toBe('Por favor complete todos los campos requeridos');
    expect(validateUsuario({ ...base, cargo: '' })).toBe('Por favor complete todos los campos requeridos');
    expect(validateUsuario({ ...base, obrasIds: [] })).toBe('Debe seleccionar al menos una Unidad de Negocio / Obra');
    expect(validateUsuario({ ...base, rut: '123456789' })).toBe('El RUT ingresado no es válido. Formato requerido: 12345678-9');
    expect(validateUsuario(base)).toBeNull();
  });
  it('validateRUT solo formato', () => {
    expect(validateRUT('12.345.678-K')).toBe(true);
    expect(validateRUT('1234567-1')).toBe(true);
    expect(validateRUT('123456-1')).toBe(false);
    expect(validateRUT('12345678')).toBe(false);
    expect(validateRUT('1234a678-1')).toBe(false);
  });
  it('payload idéntico al original', () => {
    expect(buildUsuarioPayload(base)).toEqual({
      cargo: 'Analista de personal', nombre_1: 'Ana', nombres_2: null, apellido_1: 'Pérez', apellido_2: null,
      email: 'ana@flujopago.cl', rol_id: 2, rut: '12345678-9', obras_ids: [3, 5],
    });
  });
});

describe('parseMutationError', () => {
  it('422 → mensajes sin "Value error, " y campos mapeados (incluye listas)', () => {
    const e = http(422, { detail: [
      { loc: ['body', 'rut'], msg: 'Value error, El RUT es requerido.' },
      { loc: ['body', 'email'], msg: 'Value error, El correo debe pertenecer al dominio @flujopago.cl o @grupodemo.cl' },
      { loc: ['body', 'obras_ids', 0], msg: 'Input should be a valid integer' },
      { loc: ['body', 'rut'], msg: 'Value error, El RUT es requerido.' },
    ] });
    const r = parseMutationError(e, FIELD_MAP.usuario, 'fb');
    expect(r.fields).toEqual(['adminUsuarioRut', 'adminUsuarioEmail', 'adminUsuarioObras']);
    expect(r.message).toBe('El RUT es requerido., El correo debe pertenecer al dominio @flujopago.cl o @grupodemo.cl, Input should be a valid integer');
  });
  it('ids corregidos para empresa y proceso', () => {
    const e = http(422, { detail: [{ loc: ['body', 'codigo'], msg: 'x' }, { loc: ['body', 'cuenta_objeto'], msg: 'y' }] });
    expect(parseMutationError(e, FIELD_MAP.empresa, 'fb').fields).toEqual(['adminCodigo']);
    expect(parseMutationError(e, FIELD_MAP.proceso, 'fb').fields).toEqual(['adminProcesoCuentaObjeto']);
  });
  it('400 detail string, 500 con pista, red', () => {
    expect(parseMutationError(http(400, { detail: 'El email ya está registrado' }), {}, 'fb').message).toBe('El email ya está registrado');
    expect(parseMutationError(http(500, { message: 'Error interno' }, 'Error interno'), {}, 'fb').message)
      .toBe('Error interno Es posible que ya exista un registro con los mismos datos.');
    expect(simpleErrorMessage(http(500, {}, 'Error interno'), 'fb')).toBe('Error interno');
    expect(parseMutationError(new ApiError('network', 0, 'Sin conexión'), {}, 'fb').message).toBe('Sin conexión');
    expect(simpleErrorMessage(http(404, { detail: [{ msg: 'a' }] }), 'fb')).toBe('a');
  });
  it('rewriteEmpresaError', () => {
    expect(rewriteEmpresaError('Este campo excede el máximo permitido de 20 caracteres.')).toBe('El nombre o código es demasiado largo.');
    expect(rewriteEmpresaError("El nombre de la empresa 'X' ya está registrado")).toBe('Ya existe una empresa con ese nombre o código.');
    expect(rewriteEmpresaError('otro')).toBe('otro');
  });
});
