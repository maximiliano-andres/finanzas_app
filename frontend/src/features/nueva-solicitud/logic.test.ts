import { describe, expect, it } from 'vitest';
import {
  buildSolicitudFormData, cleanMonto, deriveFields, formatMontoInput, formatTotal, isPdfFile, sumFolioMontos,
  validateMonto, validateNuevaSolicitud, type FolioRow, type NuevaSolicitudValues,
} from './logic';

const row = (p: Partial<FolioRow> = {}): FolioRow => ({ key: 1, folio: '', monto: '', formaPago: '', files: [], ...p });
const base = (p: Partial<NuevaSolicitudValues> = {}): NuevaSolicitudValues => ({
  mesProceso: 'MARZO', fechaProceso: '2026-03-10', fechaPago: '2026-03-20', empresaId: '1', obraId: '2', procesoId: '3',
  observaciones: '', folios: [row({ folio: 'F1', monto: '1.000', formaPago: 'DEPOSITO' })], ...p,
});

describe('montos', () => {
  it('formatMontoInput aplica separador es-CL y conserva vacío', () => {
    expect(formatMontoInput('1234567')).toBe('1.234.567');
    expect(formatMontoInput('12a3')).toBe('123');
    expect(formatMontoInput('')).toBe('');
  });
  it('cleanMonto / validateMonto', () => {
    expect(cleanMonto('1.234')).toBe(1234);
    expect(cleanMonto('')).toBeNull();
    expect(cleanMonto('abc')).toBe(0);
    expect(validateMonto('0')).toBe(false);
    expect(validateMonto('1.000')).toBe(true);
  });
  it('suma de folios', () => {
    const rows = [row({ monto: '1.000' }), row({ monto: '2.500' }), row({ monto: '' })];
    expect(sumFolioMontos(rows)).toBe(3500);
    expect(formatTotal(rows)).toBe('3.500');
    expect(formatTotal([row()])).toBe('0');
  });
});

describe('deriveFields', () => {
  const sel = {
    empresa: { id: 1, empresa: 'ANDES', codigo: '93' },
    obra: { id: 2, numero: '1', detalle: 'OBRA NORTE', auxiliar: '0010', estado: 'ACTIVO' },
    proceso: { id: 3, nombre: 'REMUNERACIONES', proceso: 'x', cuenta_objeto: '4101', auxiliar: '01', estado: 'ACTIVO' },
  };
  it('UNE, cuentas y glosa', () => {
    expect(deriveFields(sel, 'SEPTIEMBRE')).toEqual({ une: '930010', cuentaObjeto: '4101', cuentaAuxiliar: '01', glosa: 'REMUNERACIONES OBRA NORTE SEP' });
  });
  it('glosa vacía si falta el mes; UNE requiere empresa y obra', () => {
    expect(deriveFields(sel, '').glosa).toBe('');
    expect(deriveFields({ empresa: sel.empresa }, 'MARZO').une).toBe('');
  });
  it('auxiliar nulo se concatena como "null" (comportamiento legacy B-2)', () => {
    const obra = { ...sel.obra, auxiliar: null as unknown as string };
    expect(deriveFields({ ...sel, obra }, 'MARZO').une).toBe('93null');
  });
});

describe('validateNuevaSolicitud', () => {
  it('formulario válido', () => {
    const r = validateNuevaSolicitud(base(), '1.000');
    expect(r.valid).toBe(true);
    expect(r.notifications).toEqual([]);
  });
  it('mensajes literales y resumen de campos faltantes', () => {
    const r = validateNuevaSolicitud(base({ mesProceso: '', fechaProceso: '', fechaPago: '', empresaId: '', obraId: '', procesoId: '', folios: [row()] }), '0');
    expect(r.fieldErrors).toEqual({
      mesProceso: 'Debe seleccionar un mes de proceso',
      fechaProceso: 'Debe ingresar la fecha de proceso',
      fechaPago: 'Debe ingresar la fecha de pago',
      empresa: 'Debe seleccionar una empresa',
      obra: 'Debe seleccionar una obra',
      proceso: 'Debe seleccionar un proceso',
      monto: 'Debe ingresar un monto válido mayor a cero',
    });
    expect(r.notifications).toEqual(['Faltan campos obligatorios: Mes de Proceso, Fecha de Proceso, Fecha de Pago, Empresa, Unidad / Obra, Proceso, Monto']);
  });
  it('fecha de pago anterior: error de campo sin notificación', () => {
    const r = validateNuevaSolicitud(base({ fechaPago: '2026-03-01' }), '1.000');
    expect(r.valid).toBe(false);
    expect(r.fieldErrors.fechaPago).toBe('La fecha de pago no puede ser anterior a la fecha de proceso');
    expect(r.notifications).toEqual([]);
  });
  it('folio incompleto (todo o nada)', () => {
    const r = validateNuevaSolicitud(base({ folios: [row({ folio: 'F1', monto: '1.000', formaPago: 'DEPOSITO' }), row({ folio: 'F2' })] }), '1.000');
    expect(r.folioErrors[1]).toEqual({ monto: 'Monto requerido', formaPago: 'Forma de pago requerida' });
    expect(r.folioErrors[0]).toEqual({});
    expect(r.notifications).toEqual(['Faltan campos obligatorios: Folios/Montos incompletos']);
    const r2 = validateNuevaSolicitud(base({ folios: [row({ monto: '5' })] }), '5');
    expect(r2.folioErrors[0]).toEqual({ folio: 'Folio requerido', formaPago: 'Forma de pago requerida' });
  });
  it('total distinto de la suma', () => {
    const r = validateNuevaSolicitud(base(), '2.000');
    expect(r.notifications).toEqual(['El monto total no coincide con la suma de los montos por folio.']);
  });
});

describe('buildSolicitudFormData', () => {
  it('campos, orden, repetidos y PDF renombrado', () => {
    const pdf1 = new File(['a'], 'doc.pdf', { type: 'application/pdf' });
    const pdf2 = new File(['b'], 'otro.pdf', { type: 'application/pdf' });
    const v = base({
      observaciones: 'nota',
      folios: [
        row({ folio: 'F1', monto: '1.000', formaPago: 'DEPOSITO', files: [pdf1, pdf2] }),
        row({ folio: '', monto: '', formaPago: '' }),
        row({ folio: 'F2', monto: '2.500', formaPago: 'VALE VISTA' }),
      ],
    });
    const fd = buildSolicitudFormData(v, {
      solicitanteNombre: 'Ana María Pérez', empresaNombre: 'ANDES', obraNombre: 'OBRA NORTE', procesoNombre: 'REMUN',
      une: '930010', cuentaObjeto: '4101', cuentaAuxiliar: '01', glosa: 'REMUN OBRA NORTE MAR', montoTotal: '3.500',
    });
    const entries = [...fd.entries()].map(([k, val]) => [k, typeof val === 'string' ? val : (val as File).name]);
    expect(entries).toEqual([
      ['solicitante', 'Ana María Pérez'],
      ['fecha_solicitud', '2026-03-10'],
      ['empresa', 'ANDES'],
      ['obra', 'OBRA NORTE'],
      ['proceso', 'REMUN'],
      ['monto', '3500'],
      ['estado', 'ESPERANDO'],
      ['reviso', 'Jefe de Recursos Humanos'],
      ['mes_de_proceso', 'MARZO'],
      ['anio', '2026'],
      ['cuenta_contable', '4101'],
      ['auxiliar', '01'],
      ['fecha_de_pago', '2026-03-20'],
      ['unidad_de_negocio', '930010'],
      ['folio', 'F1'],
      ['montos_por_folio', '1000'],
      ['forma_pago', 'DEPOSITO'],
      ['pdfs', 'F1_doc.pdf'],
      ['folio', 'F2'],
      ['montos_por_folio', '2500'],
      ['forma_pago', 'VALE VISTA'],
      ['glosa', 'REMUN OBRA NORTE MAR'],
      ['observaciones', 'nota'],
    ]);
  });
  it('omite glosa/observaciones vacías', () => {
    const fd = buildSolicitudFormData(base(), {
      solicitanteNombre: 'X', empresaNombre: 'E', obraNombre: 'O', procesoNombre: 'P', une: 'U', cuentaObjeto: 'C', cuentaAuxiliar: 'A', glosa: '', montoTotal: '1.000',
    });
    expect(fd.has('glosa')).toBe(false);
    expect(fd.has('observaciones')).toBe(false);
  });
});

it('isPdfFile', () => {
  expect(isPdfFile(new File([''], 'a.PDF'))).toBe(true);
  expect(isPdfFile(new File([''], 'a.png', { type: 'image/png' }))).toBe(false);
});
