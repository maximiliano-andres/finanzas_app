/**
 * Exportación Excel con xlsx-js-style (misma librería/versión que el original, ahora empaquetada
 * y cargada bajo demanda: no penaliza la carga inicial).
 */
export type XLSXModule = typeof import('xlsx-js-style');

let mod: Promise<XLSXModule> | null = null;
export function loadXlsx(): Promise<XLSXModule> {
  mod ??= import('xlsx-js-style').then((m) => ((m as unknown as { default?: XLSXModule }).default ?? m) as XLSXModule);
  return mod;
}

/** utils.js downloadExcel: hoja "Datos", fila 0 en negrita. `rows` = array de arrays (primera fila = encabezados). */
export async function downloadExcel(rows: unknown[][], filename: string): Promise<void> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (ws['!ref']) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let c = range.s.c; c <= range.e.c; ++c) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { ...(cell.s ?? {}), font: { bold: true } };
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, filename);
}
