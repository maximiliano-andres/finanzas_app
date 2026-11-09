import { useMemo, useState } from 'react';
import { useHistorico, useRecepcionado, useSolicitudes } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { generarComprobanteContable } from '@/features/finanzas/comprobante';
import { downloadExcel } from '@/lib/excel';
import { todayISO } from '@/lib/format';
import { ReportCard, type CardTheme } from './ReportCard';
import {
  EMPTY_FILTERS, FINANZAS_ESTADOS, buildExcelAoa, filterRows, finanzasBase, historicoOptions, reportFilename,
  toComprobanteRows, todasOptions, type ReportFilters, type ReportRow,
} from './reportLogic';

const THEMES: Record<'hist' | 'todas' | 'fin', CardTheme> = {
  hist: { iconBg: 'bg-primary-soft text-primary', icon: 'fa-history', ring: '', button: '', buttonIcon: 'fa-file-download' },
  todas: { iconBg: 'bg-[var(--info-bg)] text-[var(--info)]', icon: 'fa-list-alt', ring: '', button: '', buttonIcon: 'fa-file-export' },
  fin: { iconBg: 'bg-[var(--success-bg)] text-[var(--success)]', icon: 'fa-check-double', ring: '', button: '', buttonIcon: 'fa-download' },
};

const NO_DATA = 'No hay datos para exportar con los filtros seleccionados';
const rowsOf = (d: unknown) => (d ?? []) as ReportRow[];

/**
 * Sección Reportes (reports.js). Las opciones de filtro se derivan de las queries compartidas, por lo que se
 * refrescan solas al llegar datos.
 * Cambio vs legacy: el original escuchaba un evento que nunca se emitía ('flujopago-solicitudes-loaded') y añadía
 * 3 listeners globales en cada visita sin quitarlos; aquí no hay listeners.
 */
export default function ReportesPage() {
  const hist = useHistorico();
  const sol = useSolicitudes();
  const rec = useRecepcionado();
  const notify = useToast();
  const [fHist, setFHist] = useState<ReportFilters>(EMPTY_FILTERS);
  const [fTodas, setFTodas] = useState<ReportFilters>(EMPTY_FILTERS);
  const [fFin, setFFin] = useState<ReportFilters>(EMPTY_FILTERS);
  const [busy, setBusy] = useState<'hist' | 'todas' | 'fin' | null>(null);

  const histRows = useMemo(() => rowsOf(hist.data), [hist.data]);
  const todasRows = useMemo(() => [...rowsOf(sol.data), ...rowsOf(rec.data)], [sol.data, rec.data]);
  const optHist = useMemo(() => historicoOptions(histRows), [histRows]);
  const optTodas = useMemo(() => todasOptions(todasRows), [todasRows]);
  // Cambio vs legacy: las opciones de Finanzas salen solo de registros PAGADO/RECEPCIONADO (antes de todo el
  // histórico, permitiendo elegir valores que siempre daban "No hay datos…").
  const optFin = useMemo(() => historicoOptions(finanzasBase(histRows), FINANZAS_ESTADOS), [histRows]);

  /** Refresca antes de exportar (como el original). Cambio vs legacy: si falla, se informa y no se exporta con datos viejos. */
  async function refresh(...queries: Array<{ refetch: () => Promise<{ isError: boolean; error: unknown; data?: unknown }> }>) {
    const results = await Promise.all(queries.map((q) => q.refetch()));
    const failed = results.find((r) => r.isError);
    if (failed) {
      notify(`No se pudieron actualizar los datos del reporte: ${(failed.error as Error)?.message ?? ''}`.trim(), 'error');
      return null;
    }
    return results.map((r) => rowsOf(r.data));
  }

  async function run(key: 'hist' | 'todas' | 'fin', fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (e) {
      notify(`Error al generar el reporte: ${(e as Error)?.message ?? ''}`, 'error');
    } finally { setBusy(null); }
  }

  const exportHistorico = () => run('hist', async () => {
    notify('Generando reporte histórico...', 'info', 2000);
    const r = await refresh(hist);
    if (!r) return;
    const data = filterRows(r[0], fHist);
    if (!data.length) { notify(NO_DATA, 'warning'); return; }
    await downloadExcel(buildExcelAoa(data), reportFilename('Historico', todayISO()));
    notify('Reporte histórico exportado exitosamente', 'success');
  });

  const exportTodas = () => run('todas', async () => {
    notify('Generando reporte general...', 'info', 2000);
    const r = await refresh(sol, rec);
    if (!r) return;
    const data = filterRows([...r[0], ...r[1]], fTodas);
    if (!data.length) { notify(NO_DATA, 'warning'); return; }
    await downloadExcel(buildExcelAoa(data), reportFilename('General', todayISO()));
    notify('Reporte general exportado exitosamente', 'success');
  });

  const exportFinanzas = () => run('fin', async () => {
    notify('Generando reporte recepcionado...', 'info', 2000);
    const r = await refresh(hist);
    if (!r) return;
    const data = filterRows(finanzasBase(r[0]), fFin);
    if (!data.length) { notify(NO_DATA, 'warning'); return; }
    await generarComprobanteContable(toComprobanteRows(data) as unknown as Parameters<typeof generarComprobanteContable>[0]);
    notify('Reporte generado usando la plantilla de Finanzas', 'success');
  });

  return (
    <section id="sectionReportes" className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-chart-bar" aria-hidden="true" />Reportes y Analíticas</h2>
        </div>
      </header>
      <div id="reportesContainer">
        <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
          <ReportCard prefix="filterHistorico" title="Reporte Histórico" theme={THEMES.hist} options={optHist} filters={fHist} onFilters={setFHist}
            description="Permite visualizar el historial de solicitudes finalizadas y cerradas, incluyendo sus estados definitivos, fechas de gestión y antecedentes asociados. Ideal para análisis, trazabilidad y control interno."
            buttonLabel="Descargar Reporte Histórico" onExport={exportHistorico} busy={busy === 'hist'} testId="export-historico" />
          <ReportCard prefix="filterTodas" title="Reporte de Solicitudes" theme={THEMES.todas} options={optTodas} filters={fTodas} onFilters={setFTodas}
            description="Permite visualizar el estado actualizado de cada solicitud junto con su información clave, facilitando una gestión eficiente y una correcta trazabilidad."
            buttonLabel="Descargar Reporte General" onExport={exportTodas} busy={busy === 'todas'} testId="export-general" />
          <ReportCard prefix="filterRecepcionado" title="Reporte Finanzas" theme={THEMES.fin} options={optFin} filters={fFin} onFilters={setFFin}
            description="Permite controlar y visualizar los pagos realizados y las recepciones conformes registradas en el sistema."
            buttonLabel="Descargar Reporte Recepcionado" onExport={exportFinanzas} busy={busy === 'fin'} testId="export-finanzas" />
        </div>
      </div>
    </section>
  );
}
