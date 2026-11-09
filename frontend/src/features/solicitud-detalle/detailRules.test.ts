import { describe, expect, it } from 'vitest';
import { canDeleteSolicitud, canEditSolicitud, editLabel, formatFolioMonto, glosaOf, toDetailView, unidadObraOf } from './detailRules';
import { rec, sol } from './__fixtures__/factories';

describe('toDetailView', () => {
  it('normaliza recepcionado', () => {
    const v = toDetailView(rec({ solicitante: 'S', empresa: 'E', proceso: 'P', fecha_solicitud: '2025-01-02', obra: 'OB' }), true);
    expect(v).toMatchObject({ solicitanteNombre: 'S', empresaNombre: 'E', procesoNombre: 'P', fechaProceso: '2025-01-02', obraNombre: 'OB', estado: 'RECEPCIONADO' });
  });
});

describe('botones', () => {
  it('editar: modificacion_solicitud, Rechazado, o Recepcionado PENDIENTE/ESPERANDO', () => {
    expect(canEditSolicitud(sol({ modificacion_solicitud: true, estado: 'APROBADO NIVEL 1' }))).toBe(true);
    expect(canEditSolicitud(sol({ estado: 'RECHAZADO' }))).toBe(true);
    expect(canEditSolicitud(sol({ estado: 'ESPERANDO', tipo_solicitud: 'Recepcionado' }))).toBe(true);
    expect(canEditSolicitud(sol({ estado: 'ESPERANDO' }))).toBe(false);
    expect(canEditSolicitud(toDetailView(rec({ estado: 'RECHAZADO' }), true))).toBe(false); // estado crudo, igual que el original
  });
  it('etiqueta', () => {
    expect(editLabel(sol({ estado: 'RECHAZADO' }))).toBe('Editar y Reenviar');
    expect(editLabel(sol({ estado: 'PENDIENTE', tipo_solicitud: 'Recepcionado' }))).toBe('Modificar Solicitud');
  });
  it('eliminar solo PENDIENTE/ESPERANDO (incluye estado null → Pendiente)', () => {
    expect(canDeleteSolicitud(sol({ estado: 'PENDIENTE' }))).toBe(true);
    expect(canDeleteSolicitud(sol({ estado: null }))).toBe(true);
    expect(canDeleteSolicitud(sol({ estado: 'RECHAZADO' }))).toBe(false);
  });
});

describe('formato', () => {
  it('glosa con fallback', () => {
    expect(glosaOf({ glosa: 'G', procesoNombre: 'P', auxiliar: 'A', mesProceso: 'M' })).toBe('G');
    expect(glosaOf({ glosa: null, procesoNombre: 'P', auxiliar: 'A', mesProceso: 'ENERO' })).toBe('P A ENERO');
  });
  it('unidad / obra', () => {
    expect(unidadObraOf({ auxiliar: '123', obraNombre: 'X' })).toBe('123');
    expect(unidadObraOf({ auxiliar: null, obraNombre: 'X' })).toBe('X');
    expect(unidadObraOf({ auxiliar: null, obraNombre: undefined })).toBe('-');
  });
  it('monto folio', () => {
    expect(formatFolioMonto(null)).toBe('$0');
    expect(formatFolioMonto(1500000)).toBe(`$${(1500000).toLocaleString('es-CL')}`);
  });
});
