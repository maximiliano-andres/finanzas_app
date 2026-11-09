/** Workflow.generarComprobanteContable (workflow.js:1727-2022): hoja "Comprobante" con xlsx-js-style. */
import type { SolicitudApi } from '@/types/domain';
import { loadXlsx } from '@/lib/excel';
import { buildComprobanteSheet, comprobanteFilename, type ComprobanteItem } from './comprobanteLogic';

export interface ComprobanteOptions { filename?: string; masivo?: boolean }

/**
 * Genera y descarga el comprobante. Devuelve el nombre del archivo (o '' si no hay filas) para que el llamador
 * muestre el aviso "Comprobante generado: ${filename}" (el original lo mostraba dentro de esta función).
 * Acepta solicitudes normalizadas (mapSolicitud) o registros crudos / de histórico.
 */
export async function generarComprobanteContable(
  rows: Array<SolicitudApi & Record<string, unknown>>,
  opts?: ComprobanteOptions,
): Promise<string> {
  const items = (Array.isArray(rows) ? rows : [rows]) as ComprobanteItem[];
  if (items.length === 0) return '';
  const XLSX = await loadXlsx();
  const { ws } = buildComprobanteSheet(items);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws as unknown as import('xlsx-js-style').WorkSheet, 'Comprobante');
  const filename = opts?.filename ?? comprobanteFilename(items, Date.now(), opts?.masivo);
  XLSX.writeFile(wb, filename);
  return filename;
}
