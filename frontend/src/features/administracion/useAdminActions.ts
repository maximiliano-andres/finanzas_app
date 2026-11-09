import { useState } from 'react';
import { useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';
import { simpleErrorMessage } from './adminLogic';

/** Confirmación + DELETE + toast + invalidación única (deleteEmpresa/deleteObra/deleteProceso/deleteUsuario). */
export function useDeleteAction(opts: {
  title: string;
  queryKey: readonly string[];
  remove: (id: number) => Promise<unknown>;
  success: string;
  fallback: string;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const dialog = useDialog();
  const notify = useToast();
  const invalidate = useInvalidate();

  async function run(id: number, message: string) {
    if (busyId !== null) return;
    if (!(await dialog.confirm(opts.title, message))) return;
    setBusyId(id);
    try {
      await opts.remove(id);
      notify(opts.success, 'success');
      await invalidate(opts.queryKey);
    } catch (e) {
      notify(`Error: ${simpleErrorMessage(e, opts.fallback)}`, 'error');
    } finally {
      setBusyId(null);
    }
  }
  return { busyId, run };
}
