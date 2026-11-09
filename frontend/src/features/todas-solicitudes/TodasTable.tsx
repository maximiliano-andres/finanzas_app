/** Tabla global de 19 columnas (dashboard.html:795-862 + app.js:1918-1947). */
import { formatCurrency, formatDate, getBadgeClass } from '@/lib/format';
import type { Solicitud } from '@/lib/solicitud';
import { TH, TH_FIN, TH_RRHH } from '@/features/solicitud-detalle/listParts';

const P = 'px-4 py-3 whitespace-nowrap';

export function TodasTable({ rows, onOpen, loading }: { rows: Solicitud[]; onOpen: (id: number) => void; loading: boolean }) {
  return (
    <table className="w-full text-sm table-full-visibility">
      <thead>
        <tr>
          <th scope="col" className={TH}>ID</th>
          <th scope="col" className={`${TH} border-l border-gray-100`}>Estado</th>
          <th scope="col" className={`${TH} text-center`}>Detalles</th>
          <th scope="col" className={TH}>Solicitante</th>
          <th scope="col" className={`${TH_RRHH} border-l border-purple-100`}>F. Proceso</th>
          <th scope="col" className={`${TH_RRHH} hide-on-tablet`}>UNE</th>
          <th scope="col" className={`${TH_RRHH} hide-on-tablet`}>Cuenta</th>
          <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Auxiliar</th>
          <th scope="col" className={TH_RRHH}>Nombre del Proceso</th>
          <th scope="col" className={`${TH_RRHH} border-r border-purple-100`}>Monto</th>
          <th scope="col" className={`${TH_FIN} border-l border-blue-100/50 hide-on-tablet`}>F. Emisión</th>
          <th scope="col" className={`${TH_FIN} hide-on-tablet`}>Obra</th>
          <th scope="col" className={TH_FIN}>Folio</th>
          <th scope="col" className={TH_FIN}>Monto por Folio</th>
          <th scope="col" className={`${TH_FIN} hide-on-mobile border-r border-blue-100/50`}>Forma de Pago</th>
          <th scope="col" className={`${TH} hide-on-tablet`}>Etapa</th>
          <th scope="col" className={`${TH} hide-on-mobile`}>Mes</th>
          <th scope="col" className={`${TH} hide-on-mobile`}>Año</th>
          <th scope="col" className={`${TH} hide-on-mobile`}>F. Pago</th>
        </tr>
      </thead>
      <tbody id="tablaTodasSolicitudes">
        {loading ? (
          <tr><td colSpan={19} className="py-10 text-center text-sm text-slate-500"><span className="inline-flex items-center gap-3" role="status"><span className="spinner" aria-hidden="true" />Cargando solicitudes...</span></td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={19} className="px-4 py-10 text-center text-sm text-slate-500"><i className="fas fa-magnifying-glass mr-2 text-slate-400" aria-hidden="true" />No se encontraron registros</td></tr>
        ) : rows.map((s) => (
          <tr key={s.id}>
            <td className={`${P} font-semibold text-slate-900`}>#{s.id}</td>
            <td className={`${P} text-center`}><span className={getBadgeClass(s.estado)}>{s.estado}</span></td>
            <td className="px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <button type="button" onClick={() => onOpen(s.id)} className="ui-icon-btn" title="Ver detalle"
                  aria-label={`Ver detalle de la solicitud ${s.id}`} data-testid={`ver-detalle-${s.id}`}>
                  <i className="fas fa-eye" aria-hidden="true" />
                </button>
              </div>
            </td>
            <td className={`${P} text-gray-700 font-medium`}>{s.solicitanteNombre || '-'}</td>
            <td className={`${P} bg-purple-100/20 text-gray-700`}>{formatDate(s.fechaProceso)}</td>
            <td className={`${P} bg-purple-100/20 text-blue-700 font-medium hide-on-mobile`}>{s.unidadDeNegocio || '-'}</td>
            <td className={`${P} bg-purple-100/20 text-gray-500 hide-on-mobile font-mono text-xs`}>{s.cuentaContable || '-'}</td>
            <td className={`${P} bg-purple-100/20 text-gray-500 hide-on-mobile text-xs`}>{s.auxiliar || '-'}</td>
            <td className={`${P} bg-purple-100/20 text-gray-700`}>{s.procesoNombre || '-'}</td>
            <td className={`${P} bg-purple-100/20 text-slate-900 font-semibold`}>{formatCurrency(s.monto)}</td>
            <td className={`${P} bg-blue-100/20 text-gray-700 hide-on-mobile`}>{formatDate(s.fechaEmision)}</td>
            <td className={`${P} bg-blue-100/20 text-gray-700 hide-on-mobile`}>{s.obra || '-'}</td>
            <td className={`${P} bg-blue-100/20 text-blue-700 font-medium`}>{s.folio || '-'}</td>
            <td className={`${P} bg-blue-100/20 text-blue-700 font-medium`}>{s.montoPorFolio || '-'}</td>
            <td className={`${P} bg-blue-100/20 text-slate-700 font-medium hide-on-mobile text-sm`}>{s.formaDePago || '-'}</td>
            <td className={`${P} text-gray-500 hide-on-mobile text-sm`}>{s.etapa || '-'}</td>
            <td className={`${P} text-gray-500 hide-on-mobile`}>{s.mesProceso || '-'}</td>
            <td className={`${P} text-gray-500 hide-on-mobile`}>{s.anio || '-'}</td>
            <td className={`${P} text-gray-500 hide-on-mobile`}>{formatDate(s.fechaPago)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
