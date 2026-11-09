/** Modal "Modificar Solicitud Activa" (forms.js showEditSolicitudModal / saveSolicitudEdit, F:1463-2066). */
import { useId, useMemo, useState, type FormEvent } from 'react';
import { solicitudesApi } from '@/api/endpoints';
import { qk, useInvalidate } from '@/api/queries';
import { useCurrentUser } from '@/auth/AuthProvider';
import { useToast } from '@/components/feedback/ToastProvider';
import type { Solicitud } from '@/lib/solicitud';
import { buildSolicitudEditPayload, computeCuadratura, solicitudReadonly } from './cuadratura';
import { CuadraturaCard } from './CuadraturaCard';
import { EditModalActions, EditModalShell, ReadonlyField, SectionCard } from './EditModalShell';
import { FolioSlotsEditor } from './FolioSlotsEditor';
import { apiErrorMessage } from './errors';
import { useFolioSlots } from './useFolioSlots';

export interface EditSolicitudModalProps { solicitud: Solicitud; onClose: () => void; onSaved?: () => void }

export default function EditSolicitudModal({ solicitud, onClose, onSaved }: EditSolicitudModalProps) {
  const user = useCurrentUser();
  const notify = useToast();
  const invalidate = useInvalidate();
  const obsId = useId();
  const ro = useMemo(() => solicitudReadonly(solicitud), [solicitud]);
  // Cambio vs legacy: textarea controlado (antes `<textarea>${observaciones}</textarea>` → XSS almacenado, X-3).
  const [observaciones, setObservaciones] = useState(solicitud.observaciones || '');
  const [saving, setSaving] = useState(false);
  const { slots, busy, editField, clearSlot, uploadPdf, deletePdf } = useFolioSlots('solicitud', solicitud);
  const cuadratura = computeCuadratura(ro.monto, slots);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Cambio vs legacy: guardia de doble envío durante el PATCH (R-4).
    if (saving || !cuadratura.canSubmit) return;
    setSaving(true);
    try {
      await solicitudesApi.patch(solicitud.id, buildSolicitudEditPayload(solicitud, slots, observaciones, user?.nombre));
      notify('Solicitud actualizada y reenviada exitosamente', 'success');
      void invalidate(qk.solicitudes);
      onSaved?.();
      onClose();
    } catch (err) {
      notify(`Error: ${apiErrorMessage(err, 'Error al actualizar la solicitud')}`, 'error');
      setSaving(false);
    }
  };

  return (
    <EditModalShell id="solicitudEditModal" formId="formEditSolicitud" icon="fa-edit" title="Modificar Solicitud Activa"
      subtitle={`Actualizando información para la solicitud #${solicitud.id}`} onClose={onClose} onSubmit={onSubmit}>
      <SectionCard icon="fa-info-circle" title="Información General">
        <ReadonlyField label="ID Solicitud" value={solicitud.id} />
        <ReadonlyField label="Solicitante" name="solicitante" value={ro.solicitante} />
      </SectionCard>
      <SectionCard icon="fa-calculator" title="Datos Contables">
        <ReadonlyField label="UNE (Autogenerada)" name="unidad_de_negocio" value={ro.une} />
        <ReadonlyField label="Cta. Contable (Autogenerada)" name="cuenta_contable" value={ro.cuentaContable} />
        <ReadonlyField label="Cta. Auxiliar (Autogenerada)" name="auxiliar" value={ro.auxiliar} />
        <ReadonlyField label="Glosa (Inmutable)" name="glosa" value={ro.glosa} className="col-span-full" />
      </SectionCard>
      <SectionCard icon="fa-edit" title="Datos Editables">
        <ReadonlyField label="Empresa" name="empresa" value={ro.empresa} />
        <ReadonlyField label="Obra / Unidad" name="obra" value={ro.obra} />
        <ReadonlyField label="Proceso" name="proceso" value={ro.proceso} />
        <ReadonlyField label="Mes de Proceso" name="mes_de_proceso" value={ro.mes} />
        <ReadonlyField label="Fecha Emisión" name="fecha_solicitud" type="date" value={ro.fechaSolicitud} />
        <ReadonlyField label="Fecha Pago" name="fecha_de_pago" type="date" value={ro.fechaPago} />
        <div className="md:col-span-2 min-w-0">
          <label htmlFor={obsId} className="ui-label">Observaciones</label>
          <textarea id={obsId} name="observaciones" rows={3} value={observaciones} disabled={saving}
            onChange={(e) => setObservaciones(e.target.value)}
            className="ui-input resize-none" />
        </div>
      </SectionCard>
      <CuadraturaCard monto={ro.monto} cuadratura={cuadratura} montoInputId="modal-solicitud-monto" />
      <FolioSlotsEditor slots={slots} incomplete={cuadratura.incomplete} busy={busy} disabled={saving}
        containerPrefix="container-solicitud-pdf-folio" onField={editField} onClear={clearSlot} onUpload={uploadPdf} onDeletePdf={deletePdf} />
      <EditModalActions onCancel={onClose} canSubmit={cuadratura.canSubmit} pending={saving} icon="fa-save" label="Guardar y Reenviar" />
    </EditModalShell>
  );
}
