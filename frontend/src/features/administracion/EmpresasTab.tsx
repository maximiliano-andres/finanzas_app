import { useState } from 'react';
import { catalogosApi } from '@/api/endpoints';
import { qk, useEmpresas, useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import type { EmpresaApi } from '@/types/domain';
import { AdminModal, ModalFooter, TextField } from './AdminModal';
import { AdminTable, CreateLink, RowActions, TabHeader, useFieldErrors } from './AdminTable';
import { FIELD_MAP, MSG_REQUIRED, parseMutationError, rewriteEmpresaError } from './adminLogic';
import { useDeleteAction } from './useAdminActions';

/** Pestaña Empresas (admin.js:86-144, 354-458). Backend {id, empresa, codigo}. */
export default function EmpresasTab() {
  const q = useEmpresas();
  const [editing, setEditing] = useState<EmpresaApi | null | undefined>(undefined);
  const del = useDeleteAction({
    title: 'Eliminar Empresa', queryKey: qk.empresas, remove: catalogosApi.deleteEmpresa,
    success: 'Empresa eliminada', fallback: 'Error al eliminar empresa',
  });
  const list = q.data ?? [];
  const openNew = () => setEditing(null);

  return (
    <>
      <TabHeader total={`Total: ${list.length} empresas`} helpId="admin-empresas-columns" newLabel="Nueva Empresa" onNew={openNew} testId="admin-new-empresa" />
      <AdminTable id="tablaAdminEmpresas" columns={['ID', 'Empresa', 'Código', 'Acciones']} loading={q.isPending}
        error={q.isError ? 'Error al cargar empresas' : null}
        empty={list.length === 0 ? <>No hay empresas registradas. <CreateLink text="Crear una nueva" onClick={openNew} /></> : null}>
        {list.map((e) => (
          <tr key={e.id}>
            <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">{e.id}</td>
            <td className="px-4 py-3 text-slate-800">{e.empresa}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.codigo}</td>
            <td className="px-4 py-3">
              <RowActions label={e.empresa} onEdit={() => setEditing(e)} busy={del.busyId === e.id}
                onDelete={() => del.run(e.id, '¿Está seguro de eliminar esta empresa?')} />
            </td>
          </tr>
        ))}
      </AdminTable>
      {editing !== undefined && <EmpresaModal key={editing?.id ?? 'new'} empresa={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function EmpresaModal({ empresa, onClose }: { empresa: EmpresaApi | null; onClose: () => void }) {
  const [nombre, setNombre] = useState(empresa?.empresa ?? '');
  const [codigo, setCodigo] = useState(empresa?.codigo ?? '');
  const [saving, setSaving] = useState(false);
  const fe = useFieldErrors();
  const notify = useToast();
  const invalidate = useInvalidate();

  async function save() {
    if (saving) return;
    const body = { empresa: nombre.trim(), codigo: codigo.trim() };
    if (!body.empresa || !body.codigo) { notify(MSG_REQUIRED, 'error'); return; }
    setSaving(true);
    try {
      if (empresa) await catalogosApi.updateEmpresa(empresa.id, body);
      else await catalogosApi.createEmpresa(body);
      onClose();
      notify(`Empresa ${empresa ? 'actualizada' : 'creada'} exitosamente`, 'success');
      await invalidate(qk.empresas);
    } catch (e) {
      const err = parseMutationError(e, FIELD_MAP.empresa, empresa ? 'Error al actualizar empresa' : 'Error al crear empresa');
      fe.set(err.fields);
      notify(`No se pudo guardar: ${rewriteEmpresaError(err.message)}`, 'error');
      setSaving(false);
    }
  }

  return (
    <AdminModal icon="fa-building" title={`${empresa ? 'Editar' : 'Nueva'} Empresa`} subtitle="Gestión de entidades legales"
      footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} />}>
      <div className="px-5 sm:px-6 py-5 space-y-4">
        <TextField id="adminNombre" label="Nombre Comercial" required value={nombre} placeholder="Ej: ANDES MINING S.A."
          errors={fe.errors} onChange={(v) => { setNombre(v); fe.clear('adminNombre'); }} />
        <TextField id="adminCodigo" label="Código Identificador" required value={codigo} placeholder="Ej: AM01" prefixIcon="fa-hashtag" mono
          errors={fe.errors} onChange={(v) => { setCodigo(v); fe.clear('adminCodigo'); }} />
      </div>
    </AdminModal>
  );
}
