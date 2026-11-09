import { useRef, useState } from 'react';
import { pdfApi } from '@/api/endpoints';
import { qk, useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';
import { errorDetail, isConnectionError, routeMessage } from './workflowApi';
import { pdfFileError } from './workflowLogic';

/** Selector de archivo temporal (input.click() del original). Resuelve null si se cancela. */
export function pickPdfFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

const confirmFileMsg = (name: string, n: number) =>
  n === 1 ? (
    <>¿Está seguro de subir el archivo <b>&quot;{name}&quot;</b> a esta solicitud?</>
  ) : (
    <>¿Está seguro de asignar el archivo <b>&quot;{name}&quot;</b> a las <b>{n}</b> solicitudes seleccionadas?</>
  );

/**
 * PDF Registro Autorización (Nivel 2) y PDF Firmado (Finanzas): carga individual/masiva y eliminación.
 * Las mutaciones se bloquean mientras hay una en curso (doble envío). Tras éxito se invalida una sola vez.
 * Cambio vs legacy: el aviso de éxito usa el `message` de la ruta (el original mostraba "Operación exitosa" del sobre, B-28).
 * Cambio vs legacy: se eliminan las esperas artificiales de 200/150 ms (B-33).
 */
export function usePdfActions() {
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

  /** handlePdfRegistroAuthUpload (W:2716-2786). */
  const registroSingle = async (id: number, file: File) => {
    const err = pdfFileError(file, true);
    if (err === 'type') return notify('El archivo debe ser un PDF', 'error');
    if (err === 'size') return notify('El archivo no puede exceder 10MB', 'error');
    const ok = await dialog.confirm(
      'Confirmar Carga de PDF',
      `¿Desea cargar "${file.name}" como Registro de Autorización?\n\nSi ya existe un PDF, será reemplazado automáticamente.`,
    );
    if (!ok) return;
    await run(async () => {
      try {
        notify('Subiendo PDF...', 'info');
        await pdfApi.uploadRegistroAutorizacion([id], file);
        notify('PDF de autorización cargado exitosamente', 'success');
        await invalidate(qk.solicitudes, qk.recepcionado, qk.historico);
      } catch (e) {
        if (isConnectionError(e)) await dialog.error('Error de conexión', 'No se pudo conectar con el servidor.');
        else await dialog.error('Error al cargar', errorDetail(e, 'No se pudo cargar el PDF.'));
      }
    });
  };

  /** handlePdfRegistroAuthMassUpload (W:2623-2714). */
  const registroMass = async (ids: number[]) => {
    if (busyRef.current) return;
    if (!ids.length) return dialog.error('Sin Selección', 'Debe seleccionar al menos una solicitud para subir el PDF de autorización.');
    const file = await pickPdfFile();
    if (!file) return;
    const err = pdfFileError(file, true);
    if (err === 'type') return dialog.error('Formato Inválido', 'El archivo seleccionado debe ser un PDF.');
    if (err === 'size') return dialog.error('Archivo muy grande', 'El archivo no puede exceder 10MB.');
    if (!(await dialog.confirm('Confirmar Asignación Masiva de PDF', confirmFileMsg(file.name, ids.length)))) return;
    await run(async () => {
      try {
        notify('Subiendo PDF de autorización...', 'info');
        const data = await pdfApi.uploadRegistroAutorizacion(ids, file);
        notify(routeMessage(data, 'PDF de autorización cargado exitosamente'), 'success');
        await invalidate(qk.solicitudes, qk.recepcionado, qk.historico);
      } catch (e) {
        if (isConnectionError(e)) await dialog.error('Error de Conexión', 'Hubo un problema al conectar con el servidor.');
        else await dialog.error('Error en Carga', errorDetail(e, 'No se pudo subir el PDF.'));
      }
    });
  };

  /** handlePdfRegistroAuthDelete (W:2788-2830). */
  const registroDelete = async (id: number) => {
    if (busyRef.current) return;
    const ok = await dialog.confirm(
      'Eliminar PDF de Autorización',
      '¿Desea eliminar el PDF de Registro de Autorización?\n\nDeberá cargar uno nuevo antes de poder aprobar la solicitud.',
    );
    if (!ok) return;
    await run(async () => {
      try {
        notify('Eliminando PDF...', 'info');
        const data = await pdfApi.deleteRegistroAutorizacion(id);
        notify(routeMessage(data, 'PDF eliminado correctamente'), 'success');
        await invalidate(qk.solicitudes, qk.recepcionado, qk.historico);
      } catch (e) {
        if (isConnectionError(e)) await dialog.error('Error de conexión', 'No se pudo conectar con el servidor.');
        else await dialog.error('Error al eliminar', errorDetail(e, 'No se pudo eliminar el PDF.'));
      }
    });
  };

  /** handlePdfFirmadoUpload (W:2445-2526). Sin límite de tamaño en el original (se conserva). */
  const firmadoMass = async (ids: number[]) => {
    if (busyRef.current) return;
    if (!ids.length) return dialog.error('Sin Selección', 'Debe seleccionar al menos una solicitud para subir el PDF firmado.');
    const file = await pickPdfFile();
    if (!file) return;
    if (pdfFileError(file, false)) return dialog.error('Formato Inválido', 'El archivo seleccionado debe ser un PDF.');
    if (!(await dialog.confirm('Confirmar Asignación de PDF', confirmFileMsg(file.name, ids.length)))) return;
    await run(async () => {
      try {
        notify('Subiendo PDF firmado...', 'info');
        const data = await pdfApi.uploadFirmado(ids, file);
        notify(routeMessage(data, 'PDF firmado subido correctamente'), 'success');
        await invalidate(qk.solicitudes, qk.recepcionado);
      } catch (e) {
        if (isConnectionError(e)) await dialog.error('Error de Conexión', 'Hubo un problema al conectar con el servidor.');
        else await dialog.error('Error en Carga', errorDetail(e, 'No se pudo subir el PDF firmado.'));
      }
    });
  };

  /** handlePdfFirmadoDelete (W:2528-2570). */
  const firmadoDelete = async (id: number) => {
    if (busyRef.current) return;
    const ok = await dialog.confirm(
      'Eliminar PDF Firmado',
      '¿Está seguro de que desea eliminar el PDF firmado? Esta acción también lo borrará permanentemente del almacenamiento.',
    );
    if (!ok) return;
    await run(async () => {
      try {
        notify('Eliminando PDF firmado...', 'info');
        const data = await pdfApi.deleteFirmado(id);
        notify(routeMessage(data, 'PDF firmado eliminado correctamente'), 'success');
        await invalidate(qk.solicitudes, qk.recepcionado, qk.historico);
      } catch (e) {
        if (isConnectionError(e)) await dialog.error('Error de Conexión', 'Hubo un problema al conectar con el servidor.');
        else await dialog.error('Error en Eliminación', errorDetail(e, 'No se pudo eliminar el PDF firmado.'));
      }
    });
  };

  return { busy, registroSingle, registroMass, registroDelete, firmadoMass, firmadoDelete };
}
