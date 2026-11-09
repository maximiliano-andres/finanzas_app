/** Tabla "Solicitudes Recientes" (app.js:970-1036). */
import { formatCurrency, formatDate, getBadgeClass } from '@/lib/format';
import type { Solicitud } from '@/lib/solicitud';
import { TH, TH_FIN, TH_RRHH } from '@/features/solicitud-detalle/listParts';

const P = 'px-4 py-3 whitespace-nowrap';

export function RecentTable({ rows, onOpen }: { rows: Solicitud[]; onOpen: (id: number) => void }) {
  return (
    <div className="table-responsive-container rounded-b-xl">
      <table className="w-full text-sm min-w-[62.5rem]">
        <thead>
          <tr>
            <th scope="col" className={TH}>ID</th>
            <th scope="col" className={TH}>Estado</th>
            <th scope="col" className={TH}>Solicitante</th>
            <th scope="col" className={`${TH_RRHH} border-l border-purple-100`}>F. Proceso</th>
            <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>UNE</th>
            <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Cuenta Objeto</th>
            <th scope="col" className={`${TH_RRHH} hide-on-mobile`}>Código Auxiliar</th>
            <th scope="col" className={TH_RRHH}>Proceso</th>
            <th scope="col" className={`${TH_RRHH} border-r border-purple-100`}>Monto Total</th>
            <th scope="col" className={`${TH_FIN} border-l border-blue-100/50 hide-on-mobile`}>F. Pago</th>
            <th scope="col" className={`${TH_FIN} hide-on-mobile`}>Detalle</th>
            <th scope="col" className={`${TH_FIN} hide-on-mobile`}>Obra</th>
            <th scope="col" className={TH_FIN}>Folio</th>
            <th scope="col" className={TH_FIN}>Monto por Folio</th>
            <th scope="col" className={`${TH_FIN} hide-on-mobile border-r border-blue-100/50`}>Forma de Pago</th>
            <th scope="col" className={`${TH} hide-on-mobile`}>Mes</th>
            <th scope="col" className={`${TH} hide-on-mobile`}>Año</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} data-testid={`reciente-${s.id}`} className="cursor-pointer group" onClick={() => onOpen(s.id)}>
              <td className={`${P} font-semibold text-slate-900 group-hover:underline underline-offset-4`}>#{s.id}</td>
              <td className={P}><span className={getBadgeClass(s.estado)}>{s.estado}</span></td>
              <td className={`${P} text-gray-700 font-medium`}>{s.solicitanteNombre}</td>
              <td className={`${P} bg-purple-100/20 text-gray-700`}>{formatDate(s.fechaProceso)}</td>
              <td className={`${P} bg-purple-100/20 text-blue-700 font-medium hide-on-mobile`}>{s.unidadDeNegocio || '-'}</td>
              <td className={`${P} bg-purple-100/20 text-gray-500 hide-on-mobile font-mono text-xs`}>{s.cuentaContable || '-'}</td>
              <td className={`${P} bg-purple-100/20 text-gray-500 hide-on-mobile text-xs`}>{s.auxiliar || '-'}</td>
              <td className={`${P} bg-purple-100/20 text-gray-700 border-l border-purple-100 border-r border-purple-100`}>{s.glosa || s.procesoNombre}</td>
              <td className={`${P} bg-purple-100/20 text-slate-900 font-semibold`}>{formatCurrency(s.monto)}</td>
              <td className={`${P} bg-blue-100/20 text-gray-700 hide-on-mobile`}>{formatDate(s.fechaPago)}</td>
              <td className={`${P} bg-blue-100/20 text-gray-700 hide-on-mobile`}>{`${s.empresaNombre || ''} - ${s.procesoNombre || ''}`}</td>
              <td className={`${P} bg-blue-100/20 text-gray-700 hide-on-mobile`}>{s.obra || '-'}</td>
              <td className={`${P} bg-blue-100/20 text-blue-700 font-medium`}>{s.folio || '-'}</td>
              <td className={`${P} bg-blue-100/20 text-blue-700 font-medium`}>{s.montoPorFolio || '-'}</td>
              <td className={`${P} bg-blue-100/20 text-slate-700 font-medium hide-on-mobile text-sm`}>{s.formaDePago || '-'}</td>
              <td className={`${P} text-gray-500 hide-on-mobile`}>{s.mesProceso ?? '-'}</td>
              <td className={`${P} text-gray-500 hide-on-mobile`}>{s.anio ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
