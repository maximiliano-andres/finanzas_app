import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { solicitudesApi } from '@/api/endpoints';
import { qk, useEmpresas, useInvalidate, useProcesos, useProcesosAuxiliares } from '@/api/queries';
import { pathFor } from '@/app/sections';
import { useCurrentUser } from '@/auth/AuthProvider';
import { useToast } from '@/components/feedback/ToastProvider';
import { todayISO } from '@/lib/format';
import { apiErrorMessage, pydanticErrorFields } from '@/features/solicitud-edicion/errors';
import {
  ERROR_FIELD_MAP, buildSolicitudFormData, deriveFields, formatTotal, validateNuevaSolicitud,
  type FolioRow, type NuevaSolicitudValues, type ValidationResult,
} from './logic';

let rowSeq = 0;
export const newFolioRow = (): FolioRow => ({ key: ++rowSeq, folio: '', monto: '', formaPago: '', files: [] });

const initialValues = (fechaProceso: string): NuevaSolicitudValues => ({
  mesProceso: '', fechaProceso, fechaPago: '', empresaId: '', obraId: '', procesoId: '', observaciones: '', folios: [newFolioRow()],
});

const NO_ERRORS: ValidationResult = { valid: true, fieldErrors: {}, folioErrors: [], notifications: [] };

/** Estado, derivados, validación y envío del formulario #formSolicitud. */
export function useNuevaSolicitud(formRef: RefObject<HTMLFormElement | null>) {
  const user = useCurrentUser();
  const notify = useToast();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const empresas = useEmpresas();
  const obras = useProcesosAuxiliares();
  const procesos = useProcesos();

  // Cambio vs legacy: fecha de hoy LOCAL (antes toISOString = fecha UTC, B-1).
  const [values, setValues] = useState<NuevaSolicitudValues>(() => initialValues(todayISO()));
  const [errors, setErrors] = useState<ValidationResult>(NO_ERRORS);
  const [serverErrorFields, setServerErrorFields] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);

  const selected = useMemo(() => ({
    empresa: empresas.data?.find((e) => String(e.id) === values.empresaId),
    obra: obras.data?.find((o) => String(o.id) === values.obraId),
    proceso: procesos.data?.find((p) => String(p.id) === values.procesoId),
  }), [empresas.data, obras.data, procesos.data, values.empresaId, values.obraId, values.procesoId]);
  const derived = deriveFields(selected, values.mesProceso);
  const montoTotal = formatTotal(values.folios);

  // Validation.validateForm: desplazar y enfocar el primer campo con error.
  useEffect(() => {
    if (!focusNonce) return;
    const el = formRef.current?.querySelector<HTMLElement>('.border-red-500');
    if (!el) return;
    el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => el.focus(), 500);
    return () => clearTimeout(t);
  }, [focusNonce, formRef]);

  const set = <K extends keyof NuevaSolicitudValues>(k: K, v: NuevaSolicitudValues[K]) => setValues((p) => ({ ...p, [k]: v }));
  const setFolios = (fn: (rows: FolioRow[]) => FolioRow[]) => setValues((p) => ({ ...p, folios: fn(p.folios) }));

  /** "Limpiar Formulario" (resetForm + resetAllPDFs): form.reset() también vacía Fecha Emisión, como el original. */
  const reset = () => {
    setValues(initialValues(''));
    setErrors(NO_ERRORS);
    setServerErrorFields([]);
  };

  /** "Validar y Previsualizar". */
  const validateAndPreview = () => {
    const r = validateNuevaSolicitud(values, montoTotal);
    setErrors(r);
    setServerErrorFields([]);
    r.notifications.forEach((n) => notify(n, 'error'));
    if (!r.valid) {
      if (Object.keys(r.fieldErrors).length || r.folioErrors.some((e) => Object.keys(e).length)) setFocusNonce((n) => n + 1);
      return;
    }
    setPreviewOpen(true);
  };

  /** "Confirmar Solicitud" → POST multipart (estado ESPERANDO). */
  const confirm = async () => {
    // Cambio vs legacy: guardia de doble envío (R-1); el voucher permanece abierto (botón deshabilitado) durante el POST.
    if (submitting) return;
    setSubmitting(true);
    try {
      const form = buildSolicitudFormData(values, {
        solicitanteNombre: user.nombre,
        empresaNombre: selected.empresa?.empresa ?? '',
        obraNombre: selected.obra?.detalle ?? '',
        procesoNombre: selected.proceso?.nombre ?? '',
        ...derived,
        montoTotal,
      }, 'ESPERANDO');
      await solicitudesApi.create(form);
      notify('Solicitud creada exitosamente', 'success');
      reset();
      setPreviewOpen(false);
      void invalidate(qk.solicitudes);
      navigate(pathFor('misSolicitudes'));
    } catch (err) {
      setPreviewOpen(false);
      setServerErrorFields(pydanticErrorFields(err).map((f) => ERROR_FIELD_MAP[f]).filter(Boolean));
      notify(`Error: ${apiErrorMessage(err, 'Error al procesar la solicitud')}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    values, set, setFolios, errors, serverErrorFields, derived, montoTotal, selected,
    catalogs: { empresas, obras, procesos },
    reset, validateAndPreview, confirm, previewOpen, closePreview: () => setPreviewOpen(false), submitting,
  };
}
