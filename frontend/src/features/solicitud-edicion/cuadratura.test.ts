import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { mapRecepcionado, mapSolicitud } from '@/lib/solicitud';
import type { SolicitudApi } from '@/types/domain';
import {
  buildRecepcionadoPayload, buildSolicitudEditPayload, clearSlotPatch, computeCuadratura, editTransition, montoToInput,
  recepcionadoMissing, recepcionadoReadonly, slotsFromRecord, type FolioSlot,
} from './cuadratura';
import { apiErrorMessage, pydanticErrorFields } from './errors';

const slot = (p: Partial<FolioSlot> = {}): FolioSlot => ({ folio: '', monto: '', formaPago: '', pdf: '', ...p });
const empties = (n: number) => Array.from({ length: n }, () => slot());

const raw: SolicitudApi = {
  id: 7, solicitante: 'Juan Pérez', empresa: 'ANDES', obra: 'OBRA N', proceso: 'REMUN', monto: 3000, estado: 'PENDIENTE',
  reviso: 'Jefe de Recursos Humanos', fecha_solicitud: '2026-02-03', fecha_de_pago: '2026-02-10', fecha_emision: '2026-02-01',
  mes_de_proceso: 'febrero', anio: 2026, cuenta_contable: '4101', auxiliar: '01', unidad_de_negocio: '930010', glosa: 'G',
  observaciones: '</textarea><img src=x onerror=alert(1)>',
  folio_uno: 'A1', monto_por_folio_uno: 1000, forma_pago_folio_uno: 'DEPOSITO', pdf_folio_uno: 'doc_pdf/a.pdf',
  folio_dos: 'A2', monto_por_folio_dos: 2000, forma_pago_folio_dos: 'RARO', pdf_folio_dos: null,
};

describe('slots y montos', () => {
  it('slotsFromRecord', () => {
    const s = slotsFromRecord(raw);
    expect(s).toHaveLength(5);
    expect(s[0]).toEqual({ folio: 'A1', monto: '1.000', formaPago: 'DEPOSITO', pdf: 'doc_pdf/a.pdf' });
    expect(s[1].formaPago).toBe('');
    expect(s[4]).toEqual(slot());
  });
  it('montoToInput redondea decimales (fix B-21)', () => {
    expect(montoToInput(1234.5)).toBe('1.235');
    expect(montoToInput(null)).toBe('');
    expect(montoToInput(0)).toBe('0');
  });
});

describe('computeCuadratura', () => {
  it('cuadrado', () => {
    const c = computeCuadratura('3.000', [slot({ folio: 'A', monto: '3.000', formaPago: 'DEPOSITO' }), ...empties(4)]);
    expect(c).toMatchObject({ status: 'cuadrado', amountText: '$ 0', canSubmit: true, hasIncomplete: false });
  });
  it('excedido', () => {
    const c = computeCuadratura('3.000', [slot({ folio: 'A', monto: '4.500', formaPago: 'DEPOSITO' }), ...empties(4)]);
    expect(c).toMatchObject({ status: 'excedido', amountText: '$ 1.500', canSubmit: false });
  });
  it('pendiente', () => {
    const c = computeCuadratura('3.000', [slot({ folio: 'A', monto: '1.000', formaPago: 'DEPOSITO' }), ...empties(4)]);
    expect(c).toMatchObject({ status: 'pendiente', amountText: '$ 2.000', canSubmit: false });
  });
  it('folio incompleto bloquea aunque cuadre', () => {
    const c = computeCuadratura('3.000', [slot({ folio: 'A', monto: '3.000', formaPago: 'DEPOSITO' }), slot({ folio: 'B' }), ...empties(3)]);
    expect(c.incomplete).toEqual([false, true, false, false, false]);
    expect(c.canSubmit).toBe(false);
  });
});

it('clearSlotPatch', () => {
  expect(clearSlotPatch('tres')).toEqual({ folio_tres: null, monto_por_folio_tres: 0, forma_pago_folio_tres: null });
});

it('editTransition (regla legacy conservada)', () => {
  expect(editTransition('Pendiente')).toEqual({ estado: 'APROBADO NIVEL 1', reviso: 'Subgerente de Capital Humano' });
  expect(editTransition('Aprobado Nivel 1')).toEqual({ estado: 'APROBADO NIVEL 2', reviso: 'Jefe de Finanzas' });
  expect(editTransition('Rechazado')).toEqual({ estado: 'PENDIENTE', reviso: 'Jefe de Recursos Humanos' });
  expect(editTransition('Esperando')).toEqual({ estado: 'PENDIENTE', reviso: 'Jefe de Recursos Humanos' });
});

describe('payloads', () => {
  it('PATCH de solicitud', () => {
    const s = mapSolicitud(raw);
    const slots = slotsFromRecord(raw);
    slots[1].formaPago = 'VALE VISTA';
    const p = buildSolicitudEditPayload(s, slots, 'obs nueva', 'Editor Uno');
    expect(Object.keys(p).slice(0, 19)).toEqual([
      'solicitante', 'fecha_solicitud', 'folio', 'empresa', 'obra', 'proceso', 'monto', 'estado', 'reviso', 'modificacion_solicitud',
      'mes_de_proceso', 'anio', 'cuenta_contable', 'auxiliar', 'fecha_de_pago', 'unidad_de_negocio', 'glosa', 'observaciones', 'folio_uno',
    ]);
    expect(p).toMatchObject({
      solicitante: 'Editor Uno', fecha_solicitud: '2026-02-03', folio: 'MÚLTIPLES FOLIOS', empresa: 'ANDES', obra: 'OBRA N', proceso: 'REMUN',
      monto: 3000, estado: 'APROBADO NIVEL 1', reviso: 'Subgerente de Capital Humano', modificacion_solicitud: false,
      mes_de_proceso: 'FEBRERO', anio: 2026, cuenta_contable: '4101', auxiliar: '01', fecha_de_pago: '2026-02-10',
      unidad_de_negocio: '930010', glosa: 'G', observaciones: 'obs nueva',
      folio_uno: 'A1', monto_por_folio_uno: 1000, pdf_folio_uno: 'doc_pdf/a.pdf', forma_pago_folio_uno: 'DEPOSITO',
      folio_dos: 'A2', monto_por_folio_dos: 2000, pdf_folio_dos: null, forma_pago_folio_dos: 'VALE VISTA',
      folio_cinco: null, monto_por_folio_cinco: null, pdf_folio_cinco: null, forma_pago_folio_cinco: null,
    });
  });
  it('guardar-como-solicitud de recepcionado', () => {
    const h = mapRecepcionado({ ...raw, estado: 'RECEPCIONADO', reviso: null, observaciones: null, folio_dos: null, folio: 'A1' });
    const p = buildRecepcionadoPayload(h, slotsFromRecord(h));
    expect(p).toMatchObject({
      solicitante: 'Juan Pérez', fecha_solicitud: '2026-02-03', folio: 'A1', monto: 3000, reviso: 'RECEPCIONADO',
      mes_de_proceso: 'FEBRERO', anio: 2026, observaciones: '', estado: 'PENDIENTE', folio_dos: null,
    });
    expect(p).not.toHaveProperty('fecha_emision');
  });
  it('campos requeridos del recepcionado', () => {
    const h = mapRecepcionado({ ...raw, anio: null, fecha_emision: null });
    expect(recepcionadoMissing(recepcionadoReadonly(h))).toEqual(['Año', 'Fecha Emisión']);
  });
});

describe('apiErrorMessage', () => {
  it('detail string, 422 y fallback', () => {
    expect(apiErrorMessage(new ApiError('http', 400, 'x', { status: 'error', code: 400, detail: "El folio 'A' ya existe en solicitudes." }), 'fb'))
      .toBe("El folio 'A' ya existe en solicitudes.");
    const e422 = new ApiError('http', 422, 'x', { status: 'error', code: 422, detail: [{ loc: ['body', 'monto'], msg: 'Value error, monto inválido' }] });
    expect(apiErrorMessage(e422, 'fb')).toBe('monto inválido');
    expect(pydanticErrorFields(e422)).toEqual(['monto']);
    expect(apiErrorMessage(new ApiError('http', 500, 'x', { status: 'error', code: 500 }), 'fb')).toBe('fb');
    expect(apiErrorMessage(new ApiError('network', 0, 'Sin conexión'), 'fb')).toBe('Sin conexión');
  });
});
