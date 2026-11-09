import { useId } from 'react';
import type { Cuadratura } from './cuadratura';

const STYLES = {
  cuadrado: { color: 'green', icon: 'fa-check', title: '¡Montos Cuadrados!', label: 'Diferencia', pulse: '' },
  excedido: { color: 'red', icon: 'fa-ban', title: 'Monto Excedido', label: 'Exceso', pulse: '' },
  pendiente: { color: 'orange', icon: 'fa-exclamation-triangle', title: 'Falta por Distribuir', label: 'Pendiente', pulse: '' },
} as const;

// Clases completas para que Tailwind las detecte.
const C = {
  green: { box: 'bg-[var(--success-bg)] border-[var(--success-border)]', dot: 'bg-[var(--success)]', k: 'text-[var(--success)]', t: 'text-[var(--success)]', l: 'text-[var(--success)]', ring: '' },
  red: { box: 'bg-[var(--danger-bg)] border-[var(--danger-border)]', dot: 'bg-[var(--danger)]', k: 'text-[var(--danger)]', t: 'text-[var(--danger)]', l: 'text-[var(--danger)]', ring: '' },
  orange: { box: 'bg-[var(--warning-bg)] border-[var(--warning-border)]', dot: 'bg-[var(--warning)]', k: 'text-[var(--warning)]', t: 'text-[var(--warning)]', l: 'text-[var(--warning)]', ring: '' },
};

/** "Monto Total (Inmutable)" + tarjeta "Estado Cuadratura" + aviso de folio incompleto (validateSums). */
export function CuadraturaCard({ monto, cuadratura, montoInputId }: { monto: string; cuadratura: Cuadratura; montoInputId: string }) {
  const id = useId();
  const st = STYLES[cuadratura.status];
  const c = C[st.color];
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 mb-5">
      <div className="space-y-3">
        <label htmlFor={id} className="ui-label !mb-0">Monto Total (Inmutable)</label>
        <div className={`relative group ${c.ring}`}>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold pointer-events-none">$</span>
          <input type="text" id={montoInputId} name="monto" value={monto} readOnly aria-describedby={`${id}-status`}
            className="ui-input !pl-7 font-semibold tabular-nums" />
        </div>
        <div id={`${id}-status`} className="animate-fadeIn" role="status" data-testid="cuadratura-status">
          <div className={`${c.box} border rounded-lg px-4 py-3 flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 ${c.dot} rounded-full flex items-center justify-center text-white text-sm shrink-0 ${st.pulse}`}>
                <i className={`fas ${st.icon}`} aria-hidden="true" />
              </div>
              <div>
                <p className={`text-xs font-medium ${c.k} opacity-80`}>Estado Cuadratura</p>
                <p className={`text-sm font-semibold ${c.t}`}>{st.title}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-xs font-medium ${c.l} opacity-80`}>{st.label}</p>
              <p className={`text-sm font-semibold tabular-nums ${c.k}`}>{cuadratura.amountText}</p>
            </div>
          </div>
        </div>
        {cuadratura.hasIncomplete && (
          <div role="alert" className="rounded-lg border px-4 py-3 text-sm bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)] flex items-center gap-2 animate-fadeIn">
            <i className="fas fa-info-circle" aria-hidden="true" />Todos los campos del folio son obligatorios
          </div>
        )}
      </div>
    </div>
  );
}
