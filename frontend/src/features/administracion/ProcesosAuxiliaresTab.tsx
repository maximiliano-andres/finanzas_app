import { useState } from 'react';
import { catalogosApi } from '@/api/endpoints';
import { qk, useInvalidate, useProcesosAuxiliares } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import type { ProcesoAuxiliarApi } from '@/types/domain';
import { AdminModal, EstadoField, ModalFooter, TextField } from './AdminModal';
import { AdminTable, CreateLink, RowActions, TabHeader, useFieldErrors } from './AdminTable';
import { FIELD_MAP, MSG_REQUIRED, estadoBadgeClass, estadoSelectValue, parseMutationError } from './adminLogic';
import { useDeleteAction } from './useAdminActions';

/** Pestaña "Procesos Auxiliares" (obras) (admin.js:146-206, 462-573). */
export default function ProcesosAuxiliaresTab() {
  const q = useProcesosAuxiliares();
  const [editing, setEditing] = useState<ProcesoAuxiliarApi | null | undefined>(undefined);
  const del = useDeleteAction({
    title: 'Eliminar Proceso Auxiliar', queryKey: qk.procesosAuxiliares, remove: catalogosApi.deleteProcesoAuxiliar,
    success: 'Proceso auxiliar eliminado', fallback: 'Error al eliminar proceso auxiliar',
  });
  const list = q.data ?? [];
  const openNew = () => setEditing(null);

  return (
    <>
      <TabHeader total={`Total: ${list.length} Procesos Auxiliares`} helpId="admin-procesos-aux-columns" newLabel="Nuevo Proceso Auxiliar"
        onNew={openNew} testId="admin-new-obra" />
      <AdminTable id="tablaAdminObras" columns={['ID', 'Número', 'Detalle', 'Auxiliar', 'Estado', 'Acciones']} loading={q.isPending}
        error={q.isError ? 'Error al cargar procesos auxiliares' : null}
        empty={list.length === 0 ? <>No hay procesos auxiliares registrados. <CreateLink text="Crear uno nuevo" onClick={openNew} /></> : null}>
        {list.map((o) => (
          <tr key={o.id}>
            <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">{o.id}</td>
            <td className="px-4 py-3 text-slate-800">{o.numero}</td>
            <td className="px-4 py-3 text-slate-800">{o.detalle}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.auxiliar}</td>
            <td className="px-4 py-3"><span className={estadoBadgeClass(o.estado)}>{o.estado}</span></td>
            <td className="px-4 py-3">
              <RowActions label={o.numero} onEdit={() => setEditing(o)} busy={del.busyId === o.id}
                onDelete={() => del.run(o.id, '¿Está seguro de eliminar este proceso auxiliar?')} />
            </td>
          </tr>
        ))}
      </AdminTable>
      {editing !== undefined && <ObraModal key={editing?.id ?? 'new'} obra={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function ObraModal({ obra, onClose }: { obra: ProcesoAuxiliarApi | null; onClose: () => void }) {
  const [numero, setNumero] = useState(obra?.numero ?? '');
  const [detalle, setDetalle] = useState(obra?.detalle ?? '');
  const [auxiliar, setAuxiliar] = useState(obra?.auxiliar ?? '');
  const [estado, setEstado] = useState(estadoSelectValue(obra?.estado));
  const [saving, setSaving] = useState(false);
  const fe = useFieldErrors();
  const notify = useToast();
  const invalidate = useInvalidate();

  async function save() {
    if (saving) return;
    // Igual que el original: solo número y auxiliar se validan en cliente (detalle lo valida el backend).
    if (!numero.trim() || !auxiliar.trim()) { notify(MSG_REQUIRED, 'error'); return; }
    const body = { numero: numero.trim(), detalle: detalle.trim(), auxiliar: auxiliar.trim(), estado: estado.toUpperCase() };
    setSaving(true);
    try {
      if (obra) await catalogosApi.updateProcesoAuxiliar(obra.id, body);
      else await catalogosApi.createProcesoAuxiliar(body);
      onClose();
      notify(`Proceso Auxiliar ${obra ? 'actualizado' : 'creado'} exitosamente`, 'success');
      await invalidate(qk.procesosAuxiliares);
    } catch (e) {
      const err = parseMutationError(e, FIELD_MAP.obra, obra ? 'Error al actualizar proceso auxiliar' : 'Error al crear proceso auxiliar');
      fe.set(err.fields);
      notify(`Error: ${err.message}`, 'error');
      setSaving(false);
    }
  }

  const bind = (id: string, set: (v: string) => void) => (v: string) => { set(v); fe.clear(id); };
  return (
    <AdminModal icon="fa-hard-hat" title={`${obra ? 'Editar' : 'Nuevo'} Proc. Auxiliar`} subtitle="Centros de costo operacional"
      footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} />}>
      <div className="px-5 sm:px-6 py-5 space-y-4">
        <TextField id="adminObraNombre" label="Identificador / Número" required value={numero} placeholder="Ej: 0010 o ROL A"
          errors={fe.errors} onChange={bind('adminObraNombre', setNumero)} />
        <TextField id="adminObraDetalle" label="Descripción Detallada" required value={detalle} placeholder="Ej: SERVICIOS MINERÍA ZONA SUR"
          errors={fe.errors} onChange={bind('adminObraDetalle', setDetalle)} />
        <TextField id="adminObraAuxiliar" label="Código Auxiliar ERP" required value={auxiliar} placeholder="Ej: 0010" prefixIcon="fa-link" mono
          errors={fe.errors} onChange={bind('adminObraAuxiliar', setAuxiliar)} />
        <EstadoField id="adminObraEstado" value={estado} errors={fe.errors}
          onChange={(v) => { setEstado(v === 'Inactivo' ? 'Inactivo' : 'Activo'); fe.clear('adminObraEstado'); }} />
      </div>
    </AdminModal>
  );
}
