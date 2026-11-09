import { describe, expect, it } from 'vitest';
import { getFolioSubRows, mapRecepcionado, mapSolicitud, normalizeEstado } from './solicitud';
import type { SolicitudApi } from '@/types/domain';

const base: SolicitudApi = { id: 1, solicitante: 'Ana', empresa: 'ANDES', proceso: 'P', monto: 1000, folio: 'F1', folio_uno: 'F1', monto_por_folio_uno: 1000, forma_pago_folio_uno: 'DEPOSITO', usuario_id: '7' };

describe('normalización idéntica a data.js', () => {
  it('estados', () => {
    expect(normalizeEstado('APROBADO NIVEL 1')).toBe('Aprobado Nivel 1');
    expect(normalizeEstado('APROBADO NIVEL 2')).toBe('Aprobado nivel 2');
    expect(normalizeEstado('ESPERANDO')).toBe('Esperando');
    expect(normalizeEstado(null)).toBe('Pendiente');
  });
  it('solicitud de un folio', () => {
    const s = mapSolicitud({ ...base, estado: 'PENDIENTE' });
    expect(s).toMatchObject({ solicitanteId: 7, folio: 'F1', formaDePago: 'DEPOSITO', etapa: 'Sin Asignar', tipo_solicitud: 'Mis Solicitudes', estado: 'Pendiente', estadoRaw: 'PENDIENTE' });
  });
  it('múltiples folios', () => {
    const s = mapSolicitud({ ...base, folio_dos: 'F2', monto_por_folio_dos: 5 });
    expect(s.folio).toBe('MÚLTIPLES FOLIOS');
    expect(s.formaDePago).toBe('MÚLTIPLE');
    expect(s.montoPorFolio).toBe('MÚLTIPLES MONTOS');
    expect(getFolioSubRows(s).map((r) => r.folio)).toEqual(['F1', 'F2']);
  });
  it('recepcionado conserva estado crudo y obra "-" por defecto', () => {
    const r = mapRecepcionado({ ...base, estado: 'PAGADO', folio: null });
    expect(r.estado).toBe('PAGADO');
    expect(r.obra).toBe('-');
    expect(r.folio).toBe('-');
  });
});
