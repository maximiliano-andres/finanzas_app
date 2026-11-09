import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { AuthHeading, AuthLayout, AUTH_BUTTON, AUTH_LABEL, PasswordInput } from '@/components/layout/AuthLayout';
import { pageTitle } from '@/config/brand';
import { useToast } from '@/components/feedback/ToastProvider';
import { SESSION_KEY } from '@/auth/AuthProvider';
import { parsePydanticErrors } from '@/lib/validation';

export default function ForceChangePage() {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const notify = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!oldPw || !newPw || !confirmPw) {
      notify('Por favor complete todos los campos', 'error');
      return;
    }
    if (newPw !== confirmPw) {
      notify('Las contraseñas no coinciden', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.forceChange({ old_password: oldPw, new_password: newPw, confirm_password: confirmPw });
      notify('Contraseña actualizada exitosamente', 'success');
      setTimeout(async () => {
        await qc.invalidateQueries({ queryKey: SESSION_KEY });
        navigate('/', { replace: true }); // la sesión resolverá el siguiente paso (2FA)
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'http') {
        if (err.status === 401) { navigate('/login', { replace: true }); return; }
        // Mejora: el 422 de fortaleza muestra la regla incumplida (antes: mensaje genérico).
        const detail = parsePydanticErrors(err.body?.detail);
        notify(detail || err.body?.message || 'Error al cambiar la contraseña', 'error');
      } else {
        notify('Error de conexión con el servidor', 'error');
      }
      setSubmitting(false);
    }
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, hint?: string, ac = 'new-password') => (
    <div>
      <label htmlFor={id} className={AUTH_LABEL}>{label}</label>
      <PasswordInput id={id} value={value} onChange={set} autoComplete={ac} />
      {hint && <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{hint}</p>}
    </div>
  );

  return (
    <AuthLayout title={pageTitle('Cambio de Contraseña')} heading="Seguridad de" highlight="nivel empresarial"
      description="Se requiere una acción de seguridad. Por favor cambie su contraseña temporal.">
      <AuthHeading title="Cambio de Contraseña" subtitle="Por razones de seguridad, debes definir una nueva contraseña antes de continuar." />
      <form id="forceChangeForm" className="space-y-5" onSubmit={onSubmit} noValidate aria-busy={submitting}>
        {field('old_password', 'Contraseña Actual (Temporal)', oldPw, setOldPw, undefined, 'current-password')}
        {field('new_password', 'Nueva Contraseña', newPw, setNewPw, 'Mínimo 8 caracteres, 1 mayúscula, 1 número y 1 símbolo (!@#$&*).')}
        {field('confirm_password', 'Confirmar Nueva Contraseña', confirmPw, setConfirmPw)}
        <div className="pt-1">
          <button type="submit" disabled={submitting} className={AUTH_BUTTON}>
            <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-save'}`} aria-hidden="true" /> {submitting ? 'Guardando...' : 'Guardar y Continuar'}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
