import { useState } from 'react';
import { usuariosApi } from '@/api/endpoints';
import { qk, useInvalidate, useProcesosAuxiliares } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';
import type { UsuarioApi } from '@/types/domain';
import { AdminModal, ModalFooter, TextField } from './AdminModal';
import { useFieldErrors } from './AdminTable';
import {
  FIELD_MAP, ROLES, buildUsuarioPayload, cargosForRol, parseMutationError, resolveCargo, resolveRol,
  simpleErrorMessage, validateUsuario, type UsuarioForm,
} from './adminLogic';
import type { TempPasswordData } from './TempPasswordModal';

const SECTION = 'flex items-center gap-2 text-sm font-semibold text-slate-800 [&>i]:text-slate-400';
const LABEL = 'ui-label';
const SELECT = 'form-select';

function initialForm(u: UsuarioApi | null): UsuarioForm {
  const rol = resolveRol(u?.rol_nombre);
  return {
    nombre1: u?.nombre_1 ?? '', nombre2: u?.nombres_2 ?? '', apellido1: u?.apellido_1 ?? '', apellido2: u?.apellido_2 ?? '',
    rut: u?.rut ?? '', email: u?.email ?? '', rol, cargo: resolveCargo(rol, u?.cargo), obrasIds: u?.obras_ids ?? [],
  };
}

/** Modal "Nuevo Usuario" / "Perfil de Usuario" (admin.js:694-921, 1027-1049). */
export default function UsuarioModal({ usuario, onClose, onTempPassword }: {
  usuario: UsuarioApi | null; onClose: () => void; onTempPassword: (d: TempPasswordData, isReset: boolean) => void;
}) {
  const [f, setF] = useState<UsuarioForm>(() => initialForm(usuario));
  const [saving, setSaving] = useState(false);
  const obras = useProcesosAuxiliares();
  const fe = useFieldErrors();
  const notify = useToast();
  const dialog = useDialog();
  const invalidate = useInvalidate();

  const upd = (key: keyof UsuarioForm, id: string) => (v: string) => { setF((p) => ({ ...p, [key]: v })); fe.clear(id); };
  // updateCargoOptions: al cambiar de rol el cargo pasa a la primera opción permitida.
  const changeRol = (rol: string) => { setF((p) => ({ ...p, rol, cargo: resolveCargo(rol, null) })); fe.clear('adminUsuarioRol'); };
  const toggleObra = (id: number, on: boolean) => {
    setF((p) => ({ ...p, obrasIds: on ? [...p.obrasIds, id] : p.obrasIds.filter((x) => x !== id) }));
    fe.clear('adminUsuarioObras');
  };

  async function save() {
    if (saving) return;
    const msg = validateUsuario(f);
    if (msg) { notify(msg, 'error'); return; }
    setSaving(true);
    try {
      const payload = buildUsuarioPayload(f);
      if (usuario) {
        await usuariosApi.update(usuario.id, payload);
        onClose();
        notify('Usuario actualizado exitosamente', 'success');
      } else {
        const created = await usuariosApi.create(payload) as Partial<TempPasswordData> | null;
        if (created?.temp_password) onTempPassword(created as TempPasswordData, false);
        else { onClose(); notify('Usuario creado exitosamente', 'success'); }
      }
      await invalidate(qk.usuarios);
    } catch (e) {
      const err = parseMutationError(e, FIELD_MAP.usuario, usuario ? 'Error al actualizar usuario' : 'Error al crear usuario');
      fe.set(err.fields);
      notify(`Error: ${err.message}`, 'error');
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!usuario || saving) return;
    const nombre = `${usuario.nombre_1} ${usuario.apellido_1}`;
    const ok = await dialog.confirm('Restablecer Contraseña',
      `¿Está seguro de restablecer la contraseña de "${nombre}"? Se generará una nueva contraseña temporal de un solo uso.`);
    if (!ok) return;
    setSaving(true);
    try {
      const r = await usuariosApi.resetPassword(usuario.id) as Partial<TempPasswordData> | null;
      if (r?.temp_password) { onTempPassword(r as TempPasswordData, true); return; }
      notify('Error: No se pudo restablecer la contraseña.', 'error');
    } catch (e) {
      notify(`Error: ${simpleErrorMessage(e, 'No se pudo restablecer la contraseña.')}`, 'error');
    }
    setSaving(false);
  }

  const err = (id: string) => (fe.errors.has(id) ? 'field-error' : '');
  return (
    <AdminModal wide icon="fa-user-plus" title={`${usuario ? 'Perfil de' : 'Nuevo'} Usuario`} subtitle="Gestión de accesos y perfiles del sistema"
      footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} label="Finalizar y Guardar" icon="fa-user-check" />}>
      <div className="px-5 sm:px-6 py-5 space-y-6">
        <div className="space-y-4">
          <p className={SECTION}><i className="fas fa-id-card" aria-hidden="true" /> Información Personal</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField id="adminUsuarioNombre" label="Primer Nombre" required labelWeight="font-bold" value={f.nombre1} errors={fe.errors} onChange={upd('nombre1', 'adminUsuarioNombre')} />
            <TextField id="adminUsuarioNombre2" label="Segundo Nombre" labelWeight="font-bold" value={f.nombre2} errors={fe.errors} onChange={upd('nombre2', 'adminUsuarioNombre2')} />
            <TextField id="adminUsuarioApellidoPaterno" label="Apellido Paterno" required labelWeight="font-bold" value={f.apellido1} errors={fe.errors} onChange={upd('apellido1', 'adminUsuarioApellidoPaterno')} />
            <TextField id="adminUsuarioApellidoMaterno" label="Apellido Materno" labelWeight="font-bold" value={f.apellido2} errors={fe.errors} onChange={upd('apellido2', 'adminUsuarioApellidoMaterno')} />
          </div>
          <TextField id="adminUsuarioRut" label="RUT Identificador" required labelWeight="font-bold" mono placeholder="12345678-9" value={f.rut} errors={fe.errors} onChange={upd('rut', 'adminUsuarioRut')} />
        </div>

        <hr className="border-[var(--border)]" />

        <div className="space-y-4">
          <p className={SECTION}><i className="fas fa-cog" aria-hidden="true" /> Configuración de Cuenta</p>
          <TextField id="adminUsuarioEmail" type="email" label="Correo Institucional" required labelWeight="font-bold" placeholder="usuario@flujopago.cl o usuario@grupodemo.cl"
            value={f.email} errors={fe.errors} onChange={upd('email', 'adminUsuarioEmail')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="adminUsuarioRol" className={LABEL}>Rol de Acceso <span className="text-[var(--danger)]">*</span></label>
              <select id="adminUsuarioRol" value={f.rol} onChange={(e) => changeRol(e.target.value)} className={`${SELECT} ${err('adminUsuarioRol')}`}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="adminUsuarioCargo" className={LABEL}>Cargo / Puesto <span className="text-[var(--danger)]">*</span></label>
              <select id="adminUsuarioCargo" value={f.cargo} onChange={(e) => upd('cargo', 'adminUsuarioCargo')(e.target.value)} className={`${SELECT} ${err('adminUsuarioCargo')}`}>
                {cargosForRol(f.rol).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="pt-1">
            <legend className={LABEL}>Unidades de Negocio Asignadas (Obras) <span className="text-[var(--danger)]">*</span></legend>
            <div id="adminUsuarioObras" className={`bg-white border border-[var(--border)] rounded-lg p-2 max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 custom-scrollbar ${err('adminUsuarioObras')}`}>
              {obras.isPending && <span className="text-xs text-slate-500 p-1.5"><i className="fas fa-spinner fa-spin mr-1" aria-hidden="true" />Cargando...</span>}
              {(obras.data ?? []).map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer px-2 py-1.5 hover:bg-slate-50 rounded-md transition-colors">
                  <input type="checkbox" name="usuarioObras" value={o.id} checked={f.obrasIds.includes(o.id)} onChange={(e) => toggleObra(o.id, e.target.checked)}
                    className="form-checkbox h-4 w-4 shrink-0 text-primary accent-[var(--primary)] rounded border-slate-300 focus:ring-primary" />
                  <span className="truncate" title={o.detalle}>{o.numero} - {o.detalle}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <hr className="border-[var(--border)]" />

        <div className="space-y-3">
          <p className={SECTION}><i className="fas fa-shield-alt" aria-hidden="true" /> Seguridad y Acceso</p>
          {usuario ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info)]">
              <div className="flex items-start gap-3">
                <i className="fas fa-magic mt-0.5 text-sm" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Restablecimiento de contraseña</p>
                  <p className="text-xs mt-1 font-normal text-slate-600">El sistema generará una nueva contraseña temporal segura y la enviará al correo del usuario. Se requerirá cambiarla al iniciar sesión.</p>
                </div>
              </div>
              <button type="button" onClick={resetPassword} disabled={saving} data-testid="admin-reset-password"
                className="ui-btn ui-btn-secondary ui-btn-sm shrink-0">
                Restablecer
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info)]">
              <i className="fas fa-magic mt-0.5 text-sm" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Contraseña generada automáticamente</p>
                <p className="text-xs mt-1 font-normal text-slate-600">El sistema generará una contraseña temporal segura y se la enviará al correo del usuario. Al primer inicio de sesión, el sistema le pedirá que la cambie.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
