/** Tabla de recepcionados por empresa (app.js:818-839 cabecera + renderRecepcionadoRow 5-171). */
import type { MouseEvent } from 'react';
import { usePdfViewer } from '@/components/pdf/PdfViewerProvider';
import { formatCurrency, formatDate, getBadgeClass } from '@/lib/format';
import { getFolioSubRows, type Recepcionado } from '@/lib/solicitud';
import { SubCell, TH, TH_FIN, TH_RRHH } from '@/features/solicitud-detalle/listParts';
import { pdfNames } from './recepcionadoLogic';

interface Props {
  tableId: string;
  slug: string;
  rows: Recepcionado[];
  showModificar: boolean;
  onOpen: (id: number) => void;
  onModificar: (r: Recepcionado) => void;
}

const P = 'px-4 py-3 whitespace-nowrap';
const R = `${P} bg-purple-100/20 border-l border-purple-100`;
const F = 'bg-blue-100/20 whitespace-nowrap border-l border-blue-100/50';

function SinPdf() {
  return (
    <div className="flex flex-col items-center opacity-40">
      <i className="fas fa-file-upload text-slate-400 text-base mb-1" aria-hidden="true" />
      <span className="text-[0.6875rem] text-slate-500 font-medium">Sin PDF</span>
    </div>
  );
}

function PdfPill({ path, title, tone, showName }: { path: string; title: string; tone: 'green' | 'red'; showName: boolean }) {
  const openPdf = usePdfViewer();
  const { full, short } = pdfNames(path);
  // Cambio vs legacy: el clic en el ojo no abre además el detalle de la fila (stopPropagation).
  const ver = (e: MouseEvent) => { e.stopPropagation(); openPdf(path, title); };
  return (
    <div className="flex items-center justify-center">
      <div className={`inline-flex items-center bg-white border ${tone === 'green' ? 'border-green-200' : 'border-red-200'} rounded-full px-2.5 py-1 gap-2`}>
        <span className={`${tone === 'green' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} text-[0.6875rem] font-semibold px-1.5 py-0.5 rounded`}>SUBIDO</span>
        {showName && <span className="text-[0.6875rem] font-medium text-slate-700 truncate max-w-[6.25rem] leading-tight" title={full}>{short}</span>}
        <div className={`flex items-center border-l border-gray-100 pl-2 ${showName ? 'gap-2' : ''}`}>
          <button type="button" onClick={ver} title={`Ver PDF: ${full}`} aria-label={`Ver PDF: ${full}`}
            className="ui-icon-btn !w-7 !h-7">
            <i className="fas fa-eye text-sm" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecepcionadoTable({ tableId, slug, rows, showModificar, onOpen, onModificar }: Props) {
  return (
    <table id={tableId} className="w-full text-sm min-w-[62.5rem]">
      <thead>
        <tr>
          <th scope="col" className={TH}>ID</th>
          {showModificar && <th scope="col" className={`${TH} text-center border-l border-gray-100`} id={`th-modificar-${slug}`}>Modificar</th>}
          <th scope="col" className={TH}>Estado</th>
          <th scope="col" className={TH}>Solicitante</th>
          <th scope="col" className={`${TH_RRHH} border-l border-purple-100`}>F. Solicitud</th>
          <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Unidad</th>
          <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Cuenta</th>
          <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Auxiliar</th>
          <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Proceso</th>
          <th scope="col" className={`${TH_RRHH} border-r border-purple-100`}>Monto</th>
          <th scope="col" className={`${TH_FIN} border-l border-blue-100/50 hide-on-mobile`}>Fecha de Pago</th>
          <th scope="col" className={`${TH_FIN} hide-on-mobile`}>Detalle</th>
          <th scope="col" className={`${TH_FIN} hide-on-mobile`}>Obra</th>
          {/* Cambio vs legacy (bug #9): cabeceras en el mismo orden que las celdas (Folio, luego Giro Solicitado). */}
          <th scope="col" className={TH_FIN}>Folio</th>
          <th scope="col" className={TH_FIN}>Giro Solicitado</th>
          <th scope="col" className={`${TH_FIN} hide-on-mobile border-r border-blue-100/50`}>Forma de Pago</th>
          <th scope="col" className={`${TH} hide-on-mobile`}>PDF Firmado</th>
          <th scope="col" className={`${TH} hide-on-mobile`}>PDF Autorización</th>
          <th scope="col" className={`${TH} hide-on-mobile`}>Mes</th>
          <th scope="col" className={`${TH} hide-on-mobile`}>Año</th>
        </tr>
      </thead>
      <tbody id={`tbody-recepcionado-${slug}`}>
        {rows.length === 0 && (
          <tr><td colSpan={showModificar ? 20 : 19} className="px-4 py-10 text-center text-sm text-slate-500">No se encontraron registros</td></tr>
        )}
        {rows.map((h) => {
          const sub = getFolioSubRows(h);
          return (
            <tr key={h.id} data-testid={`recepcionado-row-${h.id}`} className="cursor-pointer" onClick={() => onOpen(h.id)}>
              <td className={`${P} font-semibold text-slate-900`}>#{h.id}</td>
              {showModificar && (
                <td className={`${P} text-center border-l border-gray-100`}>
                  <div className="flex items-center justify-center gap-2">
                    {h.estado !== 'PAGADO' && (
                      <button type="button" title="Modificar" aria-label={`Modificar registro ${h.id}`} data-testid={`modificar-${h.id}`}
                        onClick={(e) => { e.stopPropagation(); onModificar(h); }}
                        className="ui-icon-btn hover:!text-amber-700 hover:!bg-amber-50">
                        <i className="fas fa-edit" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              )}
              <td className={`${P} border-l border-gray-100`}>
                <span className={getBadgeClass(h.estado)}>{h.estado}</span>
              </td>
              <td className={`${P} text-slate-800 font-medium border-l border-gray-100`}>{h.solicitante}</td>
              <td className={`${R} text-gray-700`}>{formatDate(h.fechaSolicitud)}</td>
              <td className={`${R} text-blue-700 font-medium hide-on-tablet`}>{h.unidadDeNegocio || '-'}</td>
              <td className={`${R} text-gray-500 hide-on-tablet font-mono text-xs`}>{h.cuentaContable || '-'}</td>
              <td className={`${R} text-gray-500 hide-on-mobile text-xs`}>{h.auxiliar || '-'}</td>
              <td className={`${R} text-gray-700`}>{h.proceso}</td>
              <td className={`${R} text-slate-900 font-semibold tabular-nums border-r`}>{formatCurrency(h.monto)}</td>
              <td className={`${F} text-gray-700 hide-on-mobile px-4 py-3 text-center`}>{formatDate(h.fechaPago)}</td>
              <td className={`${F} text-slate-800 font-medium px-4 py-3 text-center`}>{h.glosa ?? '-'}</td>
              <td className={`${F} text-gray-700 hide-on-tablet p-0`}><SubCell rows={sub} k="obra" /></td>
              <td className={`${F} text-blue-700 font-medium p-0`}><SubCell rows={sub} k="folio" /></td>
              <td className={`${F} text-blue-700 font-medium p-0`}><SubCell rows={sub} k="monto" /></td>
              <td className={`${F} text-slate-700 font-medium hide-on-tablet text-sm p-0 border-r`}><SubCell rows={sub} k="pago" /></td>
              <td className="text-center border-l border-gray-100 px-4 py-3">
                {h.estado === 'PAGADO' && h.pdf_firmado
                  ? <PdfPill path={h.pdf_firmado} title={`PDF Firmado - #${h.id}`} tone="green" showName />
                  : <SinPdf />}
              </td>
              <td className="text-center border-l border-gray-100 px-4 py-3">
                {h.pdf_registro_autorizacion
                  ? <PdfPill path={h.pdf_registro_autorizacion} title={`Autorización - #${h.id}`} tone="red" showName={false} />
                  : <SinPdf />}
              </td>
              <td className={`${P} text-gray-500 hide-on-mobile border-l border-gray-100`}>{h.mesProceso || '-'}</td>
              <td className={`${P} text-gray-500 hide-on-mobile border-l border-gray-100`}>{h.anio || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
