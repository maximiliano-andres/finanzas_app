/** Modal "Modificar Registro Recepcionado" (forms.js showRecepcionadoModal / saveRecepcionado, F:789-1460). */
import { useMemo, useState, type FormEvent } from 'react';
import { recepcionadoApi } from '@/api/endpoints';
import { qk, useInvalidate } from '@/api/queries';
import { useToast } from '@/components/feedback/ToastProvider';
import type { Recepcionado } from '@/lib/solicitud';
import { buildRecepcionadoPayload, computeCuadratura, recepcionadoMissing, recepcionadoReadonly } from './cuadratura';
import { CuadraturaCard } from './CuadraturaCard';
import { EditModalActions, EditModalShell, ReadonlyField, SectionCard } from './EditModalShell';
import { FolioSlotsEditor } from './FolioSlotsEditor';
import { apiErrorMessage } from './errors';
import { useFolioSlots } from './useFolioSlots';

export interface EditRecepcionadoModalProps { recepcionado: Recepcionado; onClose: () => void; onSaved?: () => void }

export default function EditRecepcionadoModal({ recepcionado: h, onClose, onSaved }: EditRecepcionadoModalProps) {
  const notify = useToast();
  const invalidate = useInvalidate();
  const ro = useMemo(() => recepcionadoReadonly(h), [h]);
  const [saving, setSaving] = useState(false);
  const { slots, busy, editField, clearSlot, uploadPdf, deletePdf } = useFolioSlots('recepcionado', h);
  const cuadratura = computeCuadratura(ro.monto, slots);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Cambio vs legacy: guardia de doble envío durante el POST (R-4).
    if (saving || !cuadratura.canSubmit) return;
    // Validation.validateGenericForm('formEditRecepcionado'): campos required vacíos.
    const missing = recepcionadoMissing(ro);
    if (missing.length) {
      notify(`Complete los campos: ${missing.join(', ')}`, 'error');
      return;
    }
    setSaving(true);
    try {
      await recepcionadoApi.guardarComoSolicitud(h.id, buildRecepcionadoPayload(h, slots));
      notify('Registro guardado como nueva solicitud. El flujo de validación ha sido reiniciado', 'success');
      void invalidate(qk.recepcionado, qk.solicitudes);
      onSaved?.();
      onClose();
    } catch (err) {
      notify(`Error: ${apiErrorMessage(err, 'Error al guardar la solicitud')}`, 'error');
      setSaving(false);
    }
  };

  return (
    <EditModalShell id="recepcionadoEditModal" formId="formEditRecepcionado" icon="fa-history" title="Modificar Registro Recepcionado"
      subtitle="Se guardará como nueva solicitud con flujo de validación reiniciado" onClose={onClose} onSubmit={onSubmit}>
      <SectionCard icon="fa-info-circle" title="Información General">
        <ReadonlyField label="ID Registro" value={h.id} />
        <ReadonlyField label="Solicitante" name="solicitante" value={ro.solicitante} />
      </SectionCard>
      <SectionCard icon="fa-calculator" title="Datos Contables">
        <ReadonlyField label="UNE (Autogenerada)" name="unidad_de_negocio" value={ro.une} />
        <ReadonlyField label="Cta. Contable (Autogenerada)" name="cuenta_contable" value={ro.cuentaContable} />
        <ReadonlyField label="Cta. Auxiliar (Autogenerada)" name="auxiliar" value={ro.auxiliar} />
        <ReadonlyField label="Glosa (Autogenerada)" name="glosa" value={ro.glosa} className="col-span-full" />
      </SectionCard>
      <SectionCard icon="fa-edit" title="Datos Editables">
        <ReadonlyField label="Empresa" name="empresa" value={ro.empresa} />
        <ReadonlyField label="Obra / Unidad" name="obra" value={ro.obra} />
        <ReadonlyField label="Proceso" name="proceso" value={ro.proceso} />
        <ReadonlyField label="Mes de Proceso" name="mes_de_proceso" value={ro.mes} />
        <ReadonlyField label="Año" name="anio" type="number" value={ro.anio} />
        <ReadonlyField label="Fecha Emisión" name="fecha_emision" type="date" value={ro.fechaEmision} />
        <ReadonlyField label="Fecha Solicitud" name="fecha_solicitud" type="date" value={ro.fechaSolicitud} />
        <ReadonlyField label="Fecha Pago" name="fecha_de_pago" type="date" value={ro.fechaPago} />
      </SectionCard>
      <CuadraturaCard monto={ro.monto} cuadratura={cuadratura} montoInputId="modal-edit-monto" />
      <FolioSlotsEditor slots={slots} incomplete={cuadratura.incomplete} busy={busy} disabled={saving}
        containerPrefix="container-pdf-folio" onField={editField} onClear={clearSlot} onUpload={uploadPdf} onDeletePdf={deletePdf} />
      <EditModalActions onCancel={onClose} canSubmit={cuadratura.canSubmit} pending={saving} icon="fa-check-circle" label="Guardar como Nueva Solicitud" />
    </EditModalShell>
  );
}
