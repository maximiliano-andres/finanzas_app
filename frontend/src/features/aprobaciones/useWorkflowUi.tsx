import { lazy, Suspense, useCallback, useRef, useState, type ReactNode } from 'react';
import { qk, useInvalidate } from '@/api/queries';
import { solicitudesApi } from '@/api/endpoints';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';
import type { Solicitud } from '@/lib/solicitud';
import ActionModal from './ActionModal';
import { buildTransition, ETAPA_SUBGERENTE, needsRegistroAutorizacion, REGISTRO_REQUERIDO_TEXT, REGISTRO_REQUERIDO_TITLE, transitionMessage, type Accion } from './workflowLogic';
import { errorDetail, patchTransition } from './workflowApi';

const SolicitudDetailModal = lazy(() => import('@/features/solicitud-detalle/SolicitudDetailModal'));
const EditSolicitudModal = lazy(() => import('@/features/solicitud-edicion/EditSolicitudModal'));

type ModalState =
  | { kind: 'accion'; solicitud: Solicitud; accion: 'aprobar' | 'devolver' }
  | { kind: 'detalle'; solicitud: Solicitud }
  | { kind: 'editar'; solicitud: Solicitud }
  | null;

/**
 * Acciones por fila compartidas por Aprobaciones N1/N2 y Finanzas:
 * modal Aprobar/Devolver (procesarAccion), Ver Detalles, Modificar y Reenviar, Eliminar y Aprobar directo de Finanzas.
 */
export function useWorkflowUi() {
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const pendingRef = useRef(new Set<number>());
  const notify = useToast();
  const dialog = useDialog();
  const invalidate = useInvalidate();

  const lock = (id: number) => {
    if (pendingRef.current.has(id)) return false;
    pendingRef.current.add(id);
    setPending(new Set(pendingRef.current));
    return true;
  };
  const unlock = (id: number) => {
    pendingRef.current.delete(id);
    setPending(new Set(pendingRef.current));
  };

  const close = useCallback(() => setModal(null), []);

  /** procesarAccion (W:1435-1528). Cambio vs legacy: el aviso de éxito se muestra DESPUÉS del PATCH (B-10). */
  const procesar = async (s: Solicitud, accion: Accion, comentarios: string) => {
    const body = buildTransition(s, accion, comentarios);
    await patchTransition(s.id, body);
    const { msg, type } = transitionMessage(s, accion);
    notify(msg, type);
    await invalidate(qk.solicitudes, qk.historico);
  };

  const confirmAccion = async (s: Solicitud, accion: 'aprobar' | 'devolver', comentarios: string) => {
    if (accion === 'aprobar' && needsRegistroAutorizacion(s)) {
      setModal(null);
      await dialog.error(REGISTRO_REQUERIDO_TITLE, REGISTRO_REQUERIDO_TEXT);
      return;
    }
    try {
      await procesar(s, accion, comentarios);
      setModal(null);
    } catch (e) {
      // Cambio vs legacy: el botón vuelve a "Confirmar Acción" (el original lo dejaba como "Confirmar", B-11).
      await dialog.error('Error al procesar la acción', errorDetail(e, 'Error al actualizar solicitud'));
    }
  };

  /** Botón "Aprobar" de Finanzas (procesarFinanzasAction 'aprobar'): sin modal ni confirmación, como el original. */
  const aprobarDirecto = async (s: Solicitud, accion: Accion, comentario: string) => {
    if (!lock(s.id)) return;
    try {
      await procesar(s, accion, comentario);
    } catch (e) {
      // Cambio vs legacy: el original no capturaba el error (promesa rechazada sin aviso, tras un aviso de éxito prematuro).
      await dialog.error('Error al procesar la acción', errorDetail(e, 'Error al actualizar solicitud'));
    } finally {
      unlock(s.id);
    }
  };

  /** eliminarSolicitud (app.js:2443-2523). */
  const eliminar = async (s: Solicitud) => {
    if (pendingRef.current.has(s.id)) return;
    const ok = await dialog.confirm('Eliminar Solicitud', '¿Está seguro de que desea eliminar esta solicitud? Esta acción no se puede deshacer.');
    if (!ok || !lock(s.id)) return;
    try {
      await solicitudesApi.remove(s.id);
      notify('Solicitud eliminada exitosamente', 'success');
      await invalidate(qk.solicitudes);
    } catch (e) {
      notify(`Error al eliminar la solicitud: ${errorDetail(e, 'Error al eliminar solicitud')}`, 'error');
    } finally {
      unlock(s.id);
    }
  };

  let modals: ReactNode = null;
  if (modal?.kind === 'accion') {
    const s = modal.solicitud;
    modals = (
      <ActionModal accion={modal.accion} onClose={close}
        targetEstado={(s.etapa || '') === ETAPA_SUBGERENTE ? 'Aprobado Nivel 2' : 'Aprobado Nivel 1'}
        onConfirm={(c) => confirmAccion(s, modal.accion, c)} />
    );
  } else if (modal?.kind === 'detalle') {
    modals = <Suspense fallback={null}><SolicitudDetailModal solicitud={modal.solicitud} onClose={close} /></Suspense>;
  } else if (modal?.kind === 'editar') {
    modals = (
      <Suspense fallback={null}>
        <EditSolicitudModal solicitud={modal.solicitud} onClose={close} onSaved={() => { void invalidate(qk.solicitudes); }} />
      </Suspense>
    );
  }

  return {
    pending,
    openAccion: (solicitud: Solicitud, accion: 'aprobar' | 'devolver') => setModal({ kind: 'accion', solicitud, accion }),
    openDetalle: (solicitud: Solicitud) => setModal({ kind: 'detalle', solicitud }),
    openEditar: (solicitud: Solicitud) => setModal({ kind: 'editar', solicitud }),
    eliminar,
    aprobarDirecto,
    modals,
  };
}

export type WorkflowUi = ReturnType<typeof useWorkflowUi>;
