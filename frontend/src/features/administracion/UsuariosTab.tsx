import { useMemo, useState } from 'react';
import { usuariosApi } from '@/api/endpoints';
import { qk, useUsuarios } from '@/api/queries';
import { useCurrentUser } from '@/auth/AuthProvider';
import { useToast } from '@/components/feedback/ToastProvider';
import type { UsuarioApi } from '@/types/domain';
import { AdminTable, CreateLink, RowActions, TabHeader } from './AdminTable';
import { getRoleBadgeClass, mapUsuarioRow, type UsuarioRow } from './adminLogic';
import { TempPasswordModal, type TempPasswordData } from './TempPasswordModal';
import UsuarioModal from './UsuarioModal';
import { useDeleteAction } from './useAdminActions';

/** Pestaña Usuarios (admin.js:284-347, 694-1078). */
export default function UsuariosTab() {
  const q = useUsuarios();
  const me = useCurrentUser();
  const notify = useToast();
  const [editing, setEditing] = useState<UsuarioApi | null | undefined>(undefined);
  const [temp, setTemp] = useState<{ data: TempPasswordData; isReset: boolean } | null>(null);
  const del = useDeleteAction({
    title: 'Eliminar Usuario', queryKey: qk.usuarios, remove: usuariosApi.remove,
    success: 'Usuario eliminado exitosamente', fallback: 'Error al eliminar usuario',
  });
  const rows = useMemo(() => (q.data ?? []).map(mapUsuarioRow), [q.data]);
  const openNew = () => setEditing(null);

  function remove(u: UsuarioRow) {
    // Protección de auto-eliminación (solo cliente, como el original).
    if (me.id === u.id) { notify('No puede eliminar su propio usuario', 'error'); return; }
    void del.run(u.id, `¿Está seguro de eliminar al usuario "${u.nombre}"?`);
  }

  return (
    <>
      <TabHeader total={`Total: ${rows.length} usuarios`} helpId="admin-usuarios-columns" newLabel="Nuevo Usuario" newIcon="fa-user-plus"
        onNew={openNew} testId="admin-new-usuario" />
      <AdminTable id="tablaAdminUsuarios" columns={['ID', 'Nombre', 'Usuario', 'Email', 'Cargo', 'Rol', 'Acciones']} loading={q.isPending}
        error={q.isError ? 'Error al cargar usuarios' : null}
        empty={rows.length === 0 ? <>No hay usuarios registrados. <CreateLink text="Crear uno nuevo" onClick={openNew} /></> : null}>
        {rows.map((u) => {
          const isMe = me.id === u.id;
          return (
            <tr key={u.id} className={isMe ? 'bg-primary-soft' : ''}>
              <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">{u.id}</td>
              <td className="px-4 py-3 text-slate-800">{u.nombre} {isMe && <span className="ui-chip ml-1">(Tú)</span>}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.username}</td>
              <td className="px-4 py-3 text-slate-500">{u.email}</td>
              <td className="px-4 py-3 text-slate-800">{u.cargo}</td>
              <td className="px-4 py-3"><span className={getRoleBadgeClass(u.rol)}>{u.rol}</span></td>
              <td className="px-4 py-3">
                <RowActions label={u.nombre} onEdit={() => setEditing(u.raw)} onDelete={() => remove(u)} busy={del.busyId === u.id}
                  deleteDisabled={isMe} deleteTitle={isMe ? 'No puede eliminar su propio usuario' : 'Eliminar'} />
              </td>
            </tr>
          );
        })}
      </AdminTable>
      {editing !== undefined && (
        <UsuarioModal key={editing?.id ?? 'new'} usuario={editing} onClose={() => setEditing(undefined)}
          onTempPassword={(data, isReset) => { setEditing(undefined); setTemp({ data, isReset }); }} />
      )}
      {temp && <TempPasswordModal data={temp.data} isReset={temp.isReset} onClose={() => setTemp(null)} />}
    </>
  );
}
