/** Cabeceras y filas de "Mis Solicitudes" (app.js renderTableHeaders 1083-1136 / renderMisSolicitudesRow 1518-1622). */
import { formatCurrency, formatDate, getBadgeClass } from '@/lib/format';
import { getFolioSubRows, type Solicitud } from '@/lib/solicitud';
import { SubCell, TH, TH_FIN, TH_RRHH } from '@/features/solicitud-detalle/listParts';
import type { TipoSolicitud } from './misSolicitudesLogic';

interface Props {
  tableId: string;
  cardId: string;
  tipo: TipoSolicitud;
  rows: Solicitud[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (id: number) => void;
}

const C = 'px-4 py-3 whitespace-nowrap text-center';
const FIN = 'bg-blue-100/20 whitespace-nowrap px-4 py-3 border-r border-blue-100/50';
const RRHH = 'px-4 py-3 bg-purple-100/20 whitespace-nowrap text-center border-r border-purple-100';

export function MisSolicitudesTable({ tableId, cardId, tipo, rows, selected, onToggle, onToggleAll, onOpen }: Props) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const mis = tipo === 'Mis Solicitudes';
  return (
    <table id={tableId} className="w-full text-sm min-w-[62.5rem]">
      <thead>
        <tr>
          <th scope="col" className={TH}>
            <input type="checkbox" id={`selectAll-${cardId}`} aria-label="Seleccionar todas" checked={allChecked}
              onChange={(e) => onToggleAll(e.target.checked)} className="form-checkbox h-4 w-4 text-primary rounded border-slate-300 focus:ring-primary" />
          </th>
          <th scope="col" className={`${TH} border-l border-gray-100`}>ID</th>
          <th scope="col" className={`${TH} border-l border-gray-100`}>Estado</th>
          <th scope="col" className={TH}>Ver Detalles</th>
          <th scope="col" className={TH}>Solicitante</th>
          {mis ? (
            <>
              <th scope="col" className={`${TH_RRHH} border-l border-purple-100`}>F. Proceso</th>
              <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>UNE</th>
              <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Cuenta Objeto Código</th>
              <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Auxiliar</th>
              <th scope="col" className={TH_RRHH}>Proceso</th>
              <th scope="col" className={`${TH_RRHH} border-r border-purple-100`}>Monto Total</th>
              <th scope="col" className={`${TH} hide-on-mobile`}>Mes</th>
              <th scope="col" className={`${TH} hide-on-mobile`}>Año</th>
              <th scope="col" className={`${TH} hide-on-mobile`}>Fecha de Pago</th>
            </>
          ) : (
            <>
              <th scope="col" className={`${TH_FIN} border-l border-blue-100/50 hide-on-mobile`}>Fecha de Pago</th>
              <th scope="col" className={`${TH_FIN} hide-on-mobile`}>Detalle</th>
              <th scope="col" className={`${TH_FIN} hide-on-mobile`}>Obra</th>
              <th scope="col" className={TH_FIN}>Giro Solicitado</th>
              <th scope="col" className={TH_FIN}>Folio</th>
              <th scope="col" className={`${TH_FIN} hide-on-mobile border-r border-blue-100/50`}>Forma de Pago</th>
              <th scope="col" className={`${TH} hide-on-mobile`}>Monto Total</th>
              <th scope="col" className={`${TH} hide-on-mobile`}>Mes</th>
              <th scope="col" className={`${TH} hide-on-mobile`}>Año</th>
            </>
          )}
        </tr>
      </thead>
      <tbody id={`tbody-${cardId}`}>
        {rows.length === 0 && (
          <tr><td colSpan={15} className="px-4 py-10 text-center text-sm text-slate-500">No se encontraron registros</td></tr>
        )}
        {rows.map((s) => {
          const sub = getFolioSubRows(s);
          return (
            <tr key={s.id} className="group">
              <td className={C}>
                <input type="checkbox" value={s.id} data-monto={s.monto} data-status={s.estado} aria-label={`Seleccionar solicitud ${s.id}`}
                  checked={selected.has(s.id)} onChange={() => onToggle(s.id)}
                  className={`form-checkbox h-4 w-4 text-primary rounded border-slate-300 focus:ring-primary req-checkbox-${cardId}`} />
              </td>
              <td className={`${C} font-semibold text-slate-900 border-l border-gray-100`}>#{s.id}</td>
              <td className={`${C} border-l border-gray-100`}>
                <span className={getBadgeClass(s.estado)}>{s.estado}</span>
              </td>
              <td className={`${C} border-l border-gray-100`}>
                <button type="button" onClick={() => onOpen(s.id)} title="Ver detalle" aria-label={`Ver detalle de la solicitud ${s.id}`} data-testid={`ver-detalle-${s.id}`}
                  className="ui-icon-btn">
                  <i className="fas fa-eye" aria-hidden="true" />
                </button>
              </td>
              <td className={`${C} text-slate-800 font-medium border-l border-gray-100`}>{s.solicitanteNombre}</td>
              {mis ? (
                <>
                  <td className={`${RRHH} border-l border-purple-100 text-gray-700`}>{formatDate(s.fechaProceso)}</td>
                  <td className={`${RRHH} text-blue-700 font-medium hide-on-mobile`}>{s.unidadDeNegocio || '-'}</td>
                  <td className={`${RRHH} text-gray-500 hide-on-mobile font-mono text-xs`}>{s.cuentaContable || '-'}</td>
                  <td className={`${RRHH} text-gray-500 hide-on-mobile text-xs`}>{s.auxiliar || '-'}</td>
                  <td className={`${RRHH} text-gray-700`}>{s.glosa || s.procesoNombre}</td>
                  <td className={`${RRHH} text-slate-900 font-semibold tabular-nums !text-right`}>{formatCurrency(s.monto)}</td>
                  <td className={`${C} text-gray-500 hide-on-mobile border-l border-gray-100`}>{s.mesProceso ?? '-'}</td>
                  <td className={`${C} text-gray-500 hide-on-mobile border-l border-gray-100`}>{s.anio ?? '-'}</td>
                  <td className={`${C} text-gray-500 hide-on-mobile border-l border-gray-100`}>{formatDate(s.fechaPago)}</td>
                </>
              ) : (
                <>
                  <td className={`${FIN} border-l text-gray-700 hide-on-mobile text-center`}>{formatDate(s.fechaPago)}</td>
                  <td className={`${FIN} text-slate-800 font-medium text-center`}>{s.glosa ?? '-'}</td>
                  <td className={`${FIN} text-gray-700 hide-on-mobile`}><SubCell rows={sub} k="obra" /></td>
                  <td className={`${FIN} text-blue-700 font-medium text-right`}><SubCell rows={sub} k="monto" /></td>
                  <td className={`${FIN} text-blue-700 font-medium text-right`}><SubCell rows={sub} k="folio" /></td>
                  <td className={`${FIN} text-slate-700 font-medium hide-on-mobile text-sm text-right`}><SubCell rows={sub} k="pago" /></td>
                  <td className="px-4 py-3 text-slate-900 hide-on-mobile whitespace-nowrap text-center font-semibold tabular-nums border-l border-gray-100">{formatCurrency(s.monto)}</td>
                  <td className={`${C} text-gray-500 hide-on-mobile border-l border-gray-100`}>{s.mesProceso ?? '-'}</td>
                  <td className={`${C} text-gray-500 hide-on-mobile border-l border-gray-100`}>{s.anio ?? '-'}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
