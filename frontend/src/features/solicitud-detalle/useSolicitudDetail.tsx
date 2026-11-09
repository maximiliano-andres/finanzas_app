/**
 * Abre el detalle por id (equivale a verDetalleSolicitud(id, isRecepcionado)).
 * El registro se resuelve sobre el dataset vigente (TanStack Query): tras invalidar, el modal muestra datos frescos;
 * si el registro desaparece (p. ej. eliminado) el modal se cierra solo.
 */
import { useCallback, useState, type ReactNode } from 'react';
import type { Recepcionado, Solicitud } from '@/lib/solicitud';
import SolicitudDetailModal from './SolicitudDetailModal';

export function useSolicitudDetail<T extends Solicitud | Recepcionado>(rows: T[] | undefined, isRecepcionado = false): {
  openDetail: (id: number) => void;
  closeDetail: () => void;
  detailModal: ReactNode;
} {
  const [id, setId] = useState<number | null>(null);
  const openDetail = useCallback((x: number) => setId(x), []);
  const closeDetail = useCallback(() => setId(null), []);
  // Igual que el original: si el id no existe en el dataset no se abre nada.
  const found = id == null ? undefined : rows?.find((r) => r.id === id);
  const detailModal = found ? <SolicitudDetailModal solicitud={found} isRecepcionado={isRecepcionado} onClose={closeDetail} /> : null;
  return { openDetail, closeDetail, detailModal };
}
