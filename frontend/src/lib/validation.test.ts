import { describe, expect, it } from 'vitest';
import { isAllowedLoginEmail, parsePydanticErrors, passwordProblems } from './validation';

describe('validation', () => {
  it('dominios de login (index_login.js)', () => {
    expect(isAllowedLoginEmail('X@FLUJOPAGO.CL')).toBe(true);
    expect(isAllowedLoginEmail('a@grupodemo.cl')).toBe(true);
    expect(isAllowedLoginEmail('a@gmail.com')).toBe(false);
    expect(isAllowedLoginEmail('Max.Anti10@gmail.com')).toBe(true); // correo autorizado explícitamente
  });
  it('reglas de contraseña del backend', () => {
    expect(passwordProblems('Abcdefg1!')).toEqual([]);
    expect(passwordProblems('abc')).toHaveLength(4);
  });
  it('422 pydantic → mensaje sin "Value error, "', () => {
    expect(parsePydanticErrors([{ msg: 'Value error, A' }, { msg: 'B' }])).toBe('A, B');
    expect(parsePydanticErrors('texto')).toBe('texto');
    expect(parsePydanticErrors(undefined)).toBeNull();
  });
});
