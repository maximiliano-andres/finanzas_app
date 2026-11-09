import { useState } from 'react';
import { catalogosApi } from '@/api/endpoints';
import { qk, useInvalidate, useProcesos } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import type { ProcesoApi } from '@/types/domain';
import { AdminModal, EstadoField, ModalFooter, TextField } from './AdminModal';
import { AdminTable, CreateLink, RowActions, TabHeader, useFieldErrors } from './AdminTable';
import { FIELD_MAP, MSG_REQUIRED, estadoBadgeClass, estadoSelectValue, parseMutationError } from './adminLogic';
import { useDeleteAction } from './useAdminActions';

/** Pestaña Procesos (admin.js:208-272, 577-690). Backend {id, nombre, proceso, cuenta_objeto, auxiliar, estado}. */
export default function ProcesosTab() {
  const q = useProcesos();
  const [editing, setEditing] = useState<ProcesoApi | null | undefined>(undefined);
  const del = useDeleteAction({
    title: 'Eliminar Proceso', queryKey: qk.procesos, remove: catalogosApi.deleteProceso,
    success: 'Proceso eliminado', fallback: 'Error al eliminar proceso',
  });
  const list = q.data ?? [];
  const openNew = () => setEditing(null);

  return (
    <>
      <TabHeader total={`Total: ${list.length} procesos`} helpId="admin-procesos-columns" newLabel="Nuevo Proceso" onNew={openNew} testId="admin-new-proceso" />
      <AdminTable id="tablaAdminProcesos" columns={['ID', 'Nombre', 'Proceso', 'Cuenta Objeto', 'Cuenta Auxiliar', 'Estado', 'Acciones']}
        loading={q.isPending} error={q.isError ? 'Error al cargar procesos' : null}
        empty={list.length === 0 ? <>No hay procesos registrados. <CreateLink text="Crear uno nuevo" onClick={openNew} /></> : null}>
        {list.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">{p.id}</td>
            <td className="px-4 py-3 text-slate-800">{p.nombre}</td>
            <td className="px-4 py-3 text-slate-500">{p.proceso}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.cuenta_objeto}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.auxiliar}</td>
            <td className="px-4 py-3"><span className={estadoBadgeClass(p.estado)}>{p.estado}</span></td>
            <td className="px-4 py-3">
              <RowActions label={p.nombre} onEdit={() => setEditing(p)} busy={del.busyId === p.id}
                onDelete={() => del.run(p.id, '¿Está seguro de eliminar este proceso?')} />
            </td>
          </tr>
        ))}
      </AdminTable>
      {editing !== undefined && <ProcesoModal key={editing?.id ?? 'new'} proceso={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function ProcesoModal({ proceso, onClose }: { proceso: ProcesoApi | null; onClose: () => void }) {
  const [nombre, setNombre] = useState(proceso?.nombre ?? '');
  const [tipo, setTipo] = useState(proceso ? (proceso.proceso || proceso.nombre) : '');
  const [cuentaObjeto, setCuentaObjeto] = useState(proceso?.cuenta_objeto ?? '');
  const [cuentaAuxiliar, setCuentaAuxiliar] = useState(proceso?.auxiliar ?? '');
  const [estado, setEstado] = useState(estadoSelectValue(proceso?.estado));
  const [saving, setSaving] = useState(false);
  const fe = useFieldErrors();
  const notify = useToast();
  const invalidate = useInvalidate();

  async function save() {
    if (saving) return;
    // Igual que el original: cuenta auxiliar no se valida en cliente y se envía '' si está vacía.
    if (!nombre.trim() || !tipo.trim() || !cuentaObjeto.trim()) { notify(MSG_REQUIRED, 'error'); return; }
    const body = {
      nombre: nombre.trim(), proceso: tipo.trim(), cuenta_objeto: cuentaObjeto.trim(),
      auxiliar: cuentaAuxiliar.trim(), estado: estado.toUpperCase(),
    };
    setSaving(true);
    try {
      if (proceso) await catalogosApi.updateProceso(proceso.id, body);
      else await catalogosApi.createProceso(body);
      onClose();
      notify(`Proceso ${proceso ? 'actualizado' : 'creado'} exitosamente`, 'success');
      await invalidate(qk.procesos);
    } catch (e) {
      const err = parseMutationError(e, FIELD_MAP.proceso, proceso ? 'Error al actualizar proceso' : 'Error al crear proceso');
      fe.set(err.fields);
      notify(`Error: ${err.message}`, 'error');
      setSaving(false);
    }
  }

  const bind = (id: string, set: (v: string) => void) => (v: string) => { set(v); fe.clear(id); };
  return (
    <AdminModal icon="fa-cogs" title={`${proceso ? 'Editar' : 'Nuevo'} Proceso`} subtitle="Clasificación contable de pagos"
      footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} />}>
      <div className="px-5 sm:px-6 py-5 space-y-4">
        <TextField id="adminProcesoNombre" label="Nombre Descriptivo" required value={nombre} placeholder="Ej: REMUNERACIONES"
          errors={fe.errors} onChange={bind('adminProcesoNombre', setNombre)} />
        <TextField id="adminProcesoProceso" label="Tipo de Proceso" required value={tipo} placeholder="Ej: REMUNERACIONES"
          errors={fe.errors} onChange={bind('adminProcesoProceso', setTipo)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField id="adminProcesoCuentaObjeto" label="Cuenta Objeto" required value={cuentaObjeto} placeholder="Ej: 211310" mono
            errors={fe.errors} onChange={bind('adminProcesoCuentaObjeto', setCuentaObjeto)} />
          <TextField id="adminProcesoCuentaAuxiliar" label="Cuenta Auxiliar" required value={cuentaAuxiliar} placeholder="Ej: 0010" mono
            errors={fe.errors} onChange={bind('adminProcesoCuentaAuxiliar', setCuentaAuxiliar)} />
        </div>
        <EstadoField id="adminProcesoEstado" value={estado} errors={fe.errors}
          onChange={(v) => { setEstado(v === 'Inactivo' ? 'Inactivo' : 'Activo'); fe.clear('adminProcesoEstado'); }} />
      </div>
    </AdminModal>
  );
}
