/** Panel "Filtros de Búsqueda" (dashboard.html:686-756). */
import { ESTADO_OPTIONS, type Criterios } from './filters';

const INPUT = 'ui-input';
const LABEL = 'ui-label';

const CAMPOS: Array<{ key: keyof Criterios; id: string; label: string; type: 'date' | 'number'; placeholder?: string }> = [
  { key: 'fechaDesde', id: 'filtroFechaDesde', label: 'Fecha Desde', type: 'date' },
  { key: 'fechaHasta', id: 'filtroFechaHasta', label: 'Fecha Hasta', type: 'date' },
  { key: 'fechaPagoDesde', id: 'filtroFechaPagoDesde', label: 'F. Pago Desde', type: 'date' },
  { key: 'fechaPagoHasta', id: 'filtroFechaPagoHasta', label: 'F. Pago Hasta', type: 'date' },
  { key: 'montoMin', id: 'filtroMontoMin', label: 'Monto Mínimo', type: 'number', placeholder: '$ 0' },
  { key: 'montoMax', id: 'filtroMontoMax', label: 'Monto Máximo', type: 'number', placeholder: '$ 999,999,999' },
];

export function FiltrosPanel({ value, onChange, onLimpiar }: { value: Criterios; onChange: (c: Criterios) => void; onLimpiar: () => void }) {
  const set = (k: keyof Criterios, v: string) => onChange({ ...value, [k]: v });
  return (
    <div id="filtrosContainer" className="ui-card p-5 mb-6">
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <h3 className="section-title !mb-0">
          <i className="fas fa-filter" aria-hidden="true" />Filtros de Búsqueda
        </h3>
        <button type="button" onClick={onLimpiar} data-testid="limpiar-filtros" className="ui-btn ui-btn-ghost ui-btn-sm">
          <i className="fas fa-rotate-left text-xs" aria-hidden="true" />Limpiar Filtros
        </button>
      </div>
      <div className="filter-panel">
        <div className="filter-group">
          <label htmlFor="filtroTexto" className={LABEL}>Buscar</label>
          <input type="text" id="filtroTexto" placeholder="ID, solicitante, empresa..." className={INPUT}
            value={value.texto} onChange={(e) => set('texto', e.target.value)} />
        </div>
        <div className="filter-group">
          <label htmlFor="filtroEstado" className={LABEL}>Estado</label>
          <select id="filtroEstado" className={INPUT} value={value.estado} onChange={(e) => set('estado', e.target.value)}>
            {ESTADO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {CAMPOS.map((c) => (
          <div key={c.id} className="filter-group">
            <label htmlFor={c.id} className={LABEL}>{c.label}</label>
            <input type={c.type} id={c.id} placeholder={c.placeholder} className={INPUT}
              value={value[c.key]} onChange={(e) => set(c.key, e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );
}
