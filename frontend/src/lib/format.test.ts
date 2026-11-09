import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, getBadgeClass, parseDigits, slugify } from './format';

describe('format', () => {
  it('CLP sin decimales', () => { expect(formatCurrency(1234567)).toMatch(/\$\s?1\.234\.567/); });
  it('fecha YYYY-MM-DD no se desplaza un día por zona horaria', () => { expect(formatDate('2026-01-01')).toBe('01-01-2026'); });
  it('fecha vacía/ inválida → "-"', () => { expect(formatDate(null)).toBe('-'); expect(formatDate('xx')).toBe('-'); });
  it('parseDigits ignora separadores', () => { expect(parseDigits('1.250.000')).toBe(1250000); expect(parseDigits('')).toBe(0); });
  it('badges por estado (incluye estados normalizados)', () => {
    expect(getBadgeClass('Aprobado nivel 2')).toBe('badge-approved-n2');
    expect(getBadgeClass('RECHAZADO')).toBe('badge-rejected');
    expect(getBadgeClass(undefined)).toBe('badge-pending');
  });
  it('slugify', () => { expect(slugify('Desarrollos Mineros  Andes')).toBe('desarrollos-mineros-andes'); });
});
