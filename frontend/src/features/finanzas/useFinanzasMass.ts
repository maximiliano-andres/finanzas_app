import { useRef, useState } from 'react';
import { qk, useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';
import type { Solicitud } from '@/lib/solicitud';
import { buildTransition, type TipoSolicitud } from '@/features/aprobaciones/workflowLogic';
import { errorDetail, patchTransition, RecepcionDeleteError, recepcionar, runSequential } from '@/features/aprobaciones/workflowApi';
import { exportRows, massFinanzasStep, soloFinanzasRows, validateProcesarSeleccionadas, validateRecepcion } from './finanzasLogic';
import { generarComprobanteContable } from './comprobante';

/**
 * Operaciones masivas de Finanzas. Una sola operación a la vez (bloqueo de doble envío),
 * llamadas secuenciales sin refetch por ítem y una única invalidación al final.
 */
export function useFinanzasMass(all: Solicitud[]) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const notify = useToast();
  const dialog = useDialog();
  const invalidate = useInvalidate();

  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Errores de "recepcionado pero no eliminado" (B-6): se informan explícitamente. */
  const reportDeleteFailures = async (msgs: string[]) => {
    if (msgs.length) await dialog.error('Error al recepcionar', msgs.join('\n'));
  };

  const recepcionarTask = (deleteFailures: string[]) => async (s: Solicitud): Promise<'ok'> => {
    try {
      await recepcionar(s);
    } catch (e) {
      if (e instanceof RecepcionDeleteError) deleteFailures.push(e.message);
      throw e;
    }
    return 'ok';
  };

  /** Workflow.aprobarMultiplesFinanzas (W:2134-2251). */
  const procesarSeleccionadas = (rows: Solicitud[]) =>
    run(async () => {
      if (rows.length < 1) return;
      const invalid = validateProcesarSeleccionadas(rows);
      if (invalid) return dialog.error('Información Faltante', invalid);
      const ok = await dialog.confirm(
        'Procesar Múltiples Solicitudes',
        `¿Está seguro de procesar las ${rows.length} solicitudes seleccionadas? Se avanzarán de estado o se recepcionarán según corresponda.`,
      );
      if (!ok) return;
      notify('Procesando solicitudes...', 'info');
      const deleteFailures: string[] = [];
      const doRecepcion = recepcionarTask(deleteFailures);
      const r = await runSequential(rows, async (s) => {
        const step = massFinanzasStep(s);
        if (step.kind === 'recepcionar') return doRecepcion(s);
        if (step.kind === 'patch') {
          await patchTransition(s.id, buildTransition(s, step.accion, step.comentario));
          return 'ok';
        }
        // Cambio vs legacy: filas en estados sin acción se contaban como "procesadas" (B-7); ahora cuentan como omisión.
        return 'skip';
      });
      if (r.ok > 0) notify(`${r.ok} solicitudes procesadas correctamente`, 'success');
      if (r.failed > 0) notify(`Hubo errores/omisiones en ${r.failed} solicitudes`, 'error');
      await invalidate(qk.solicitudes, qk.recepcionado, qk.historico);
      await reportDeleteFailures(deleteFailures);
    });

  /** Workflow.procesarSoloFinanzas (W:2253-2336): todas las APROBADO FINANZAS de la empresa/tipo (B-15, conservado). */
  const procesarSoloFinanzas = (empresa: string, tipo: TipoSolicitud) =>
    run(async () => {
      const rows = soloFinanzasRows(all, empresa, tipo);
      if (rows.length < 1) return notify('No hay solicitudes en estado "Aprobado finanzas" para procesar', 'warning');
      const invalid = validateRecepcion(rows);
      if (invalid) return dialog.error('Información Faltante', invalid);
      const ok = await dialog.confirm(
        'Confirmar Recepción de Finanzas',
        `¿Está seguro de recepcionar las ${rows.length} solicitudes en estado "Aprobado finanzas"? Se guardarán en el histórico y se generarán los comprobantes contables.`,
      );
      if (!ok) return;
      notify('Procesando recepciones...', 'info');
      const deleteFailures: string[] = [];
      const r = await runSequential(rows, recepcionarTask(deleteFailures));
      if (r.ok > 0) notify(`${r.ok} solicitudes recepcionadas correctamente`, 'success');
      if (r.failed > 0) notify(`Hubo errores en ${r.failed} solicitudes${r.errors[0] ? `: ${r.errors[0]}` : ''}`, 'error');
      await invalidate(qk.solicitudes, qk.recepcionado, qk.historico);
      await reportDeleteFailures(deleteFailures);
    });

  /** Workflow.exportarSeleccionado(…, 'xlsx') (W:1683-1724). */
  const exportar = (empresa: string) =>
    run(async () => {
      const rows = exportRows(all, empresa);
      if (rows.length === 0) return notify('No hay solicitudes con estado "Aprobado por Finanzas" para exportar', 'warning');
      try {
        const filename = await generarComprobanteContable(rows);
        notify(`Comprobante generado: ${filename}`, 'success');
        notify(`Se exportaron ${rows.length} solicitud(es) aprobadas por Finanzas`, 'success');
      } catch (e) {
        // Cambio vs legacy: aviso explícito si falla la generación (el original no capturaba el error).
        notify(`Error al generar el comprobante: ${errorDetail(e, 'Error desconocido')}`, 'error');
      }
    });

  return { busy, procesarSeleccionadas, procesarSoloFinanzas, exportar };
}
