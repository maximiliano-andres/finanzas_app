import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { AuthHeading, AuthLayout, AUTH_BUTTON, AUTH_INPUT, AUTH_LABEL, PasswordInput } from '@/components/layout/AuthLayout';
import { pageTitle } from '@/config/brand';
import { useToast } from '@/components/feedback/ToastProvider';
import { SESSION_KEY } from '@/auth/AuthProvider';
import { isAllowedLoginEmail } from '@/lib/validation';

/** Mensajes por estado HTTP — idénticos a index_login.js:60-95. */
export function loginErrorMessage(err: ApiError): string {
  const m = err.body?.message;
  switch (err.status) {
    case 400: return m || 'Datos de inicio de sesión inválidos';
    case 401: return m || 'Email o contraseña incorrectos';
    case 404: return m || 'Usuario no encontrado';
    case 422: return m || 'Datos de inicio de sesión inválidos';
    case 429: return m || 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.';
    case 500: return 'Error interno del servidor. Por favor intente más tarde';
    case 503: return 'Servicio no disponible. Por favor intente más tarde';
    default: return m || `Error ${err.status}`;
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const notify = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();

  useEffect(() => {
    if (params.get('error') === 'session_expired') {
      notify('Su sesión ha expirado. Por favor, inicie sesión nuevamente.', 'error');
    }
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return; // protección doble envío (el original no la tenía)
    const em = email.trim();
    const pw = password.trim(); // el original recorta la contraseña (index_login.js:7) — se conserva
    if (!em || !pw) {
      notify('Por favor complete todos los campos', 'error');
      return;
    }
    if (!isAllowedLoginEmail(em)) {
      notify('Por favor ingrese un email válido (@flujopago.cl o @grupodemo.cl)', 'error');
      emailRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const data = await authApi.login({ email: em, password: pw, remember_device: remember });
      if (!data?.access_token) {
        notify('Error: No se recibió el token de autenticación', 'error');
        return;
      }
      // La cookie httpOnly ya fue emitida por el backend. El token del cuerpo NO se almacena.
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.kind === 'network') notify('No se pudo conectar con el servidor. Verifique su conexión a internet', 'error');
        else if (err.kind === 'timeout' || err.kind === 'aborted') notify('La solicitud fue cancelada. Por favor intente nuevamente', 'error');
        else if (err.kind === 'parse') notify('Error en la respuesta del servidor', 'error');
        else if (err.body?.status === 'error' && err.status < 400) notify(err.body.message || 'Error al iniciar sesión', 'error');
        else notify(loginErrorMessage(err), 'error');
      } else {
        notify('Error al conectar con el servidor', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Vista ilustrativa del producto (decorativa: el panel completo es aria-hidden). Muestra el recorrido real de una
  // solicitud — creación → RRHH → SCP → Finanzas — en lugar de una lista de beneficios genérica.
  const steps: Array<[string, string, 'done' | 'current' | 'next']> = [
    ['Solicitud creada', 'Solicitante', 'done'],
    ['Aprobación RRHH', 'Nivel 1', 'done'],
    ['Aprobación SCP', 'Nivel 2', 'current'],
    ['Pago y recepción', 'Finanzas', 'next'],
  ];
  const card = (
    <div className="mt-8">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-5 shadow-2xl shadow-black/20">
        <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-white/10">
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[#C3D1DE]">
              <i className="fas fa-file-invoice-dollar text-sm" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white truncate">Solicitud de pago</span>
              <span className="block text-xs text-[#9AA6B2]">Flujo de autorización</span>
            </span>
          </span>
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-[#E3B363]/15 text-[#E3B363] border border-[#E3B363]/25">
            <span className="w-1.5 h-1.5 rounded-full bg-current" />En revisión
          </span>
        </div>
        <ol className="space-y-3">
          {steps.map(([label, who, st], i) => (
            <li key={label} className="relative flex items-center gap-3">
              {i < steps.length - 1 && (
                <span className={`absolute left-[0.6875rem] top-6 h-3 w-px ${st === 'done' ? 'bg-[#6CC49A]/50' : 'bg-white/15'}`} />
              )}
              <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[0.625rem] ${
                st === 'done' ? 'bg-[#6CC49A]/15 text-[#6CC49A] ring-1 ring-[#6CC49A]/40'
                  : st === 'current' ? 'bg-[#A0B1C2]/20 text-white ring-2 ring-[#A0B1C2]/60'
                    : 'bg-white/5 text-[#7D8A97] ring-1 ring-white/15'}`}>
                {st === 'done' ? <i className="fas fa-check" /> : st === 'current' ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </span>
              <span className={`flex-1 text-sm ${st === 'next' ? 'text-[#7D8A97]' : 'text-[#E3E7EB]'} ${st === 'current' ? 'font-semibold text-white' : ''}`}>{label}</span>
              <span className="text-xs text-[#7D8A97]">{who}</span>
            </li>
          ))}
        </ol>
      </div>
      <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#9AA6B2]">
        <li className="flex items-center gap-2"><i className="fas fa-shield-halved text-[#A0B1C2]" />Verificación en dos pasos</li>
        <li className="flex items-center gap-2"><i className="fas fa-clock-rotate-left text-[#A0B1C2]" />Trazabilidad de cada aprobación</li>
      </ul>
    </div>
  );

  return (
    <AuthLayout title={pageTitle('Gestión de Pagos')} heading="Ecosistema digital de" highlight="gestión de pagos"
      description="Optimiza y centraliza tus flujos de autorización con la plataforma financiera diseñada para la excelencia operativa." card={card}>
      <AuthHeading title="Bienvenido" subtitle="Ingresa tus credenciales para continuar." eyebrow={{ icon: 'fa-shield-halved', text: 'Acceso seguro' }} />
      <form id="loginForm" noValidate className="space-y-5" onSubmit={onSubmit} aria-busy={submitting}>
        <div>
          <label htmlFor="email" className={AUTH_LABEL}>Correo electrónico</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
              <i className="fas fa-envelope text-sm" aria-hidden="true" />
            </div>
            <input ref={emailRef} type="email" id="email" name="email" required placeholder="nombre@flujopago.cl" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} className={AUTH_INPUT} aria-describedby="email-hint" />
          </div>
          <p id="email-hint" className="mt-1.5 text-xs text-slate-500">Usa tu correo corporativo @flujopago.cl o @grupodemo.cl</p>
        </div>
        <div>
          <label htmlFor="password" className={AUTH_LABEL}>Contraseña</label>
          <PasswordInput id="password" value={password} onChange={setPassword} placeholder="••••••••••••" autoComplete="current-password" />
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" id="remember_device" className="sr-only peer" checked={remember} onChange={(e) => setRemember(e.target.checked)} aria-describedby="remember-hint" />
            <span className="relative mt-0.5 w-9 h-5 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-slate-800">Confiar en este dispositivo</span>
              <span id="remember-hint" className="block text-xs text-slate-500 leading-relaxed mt-0.5">
                No se solicitará el código de verificación en este dispositivo durante los próximos 30 días.
              </span>
            </span>
          </label>
        </div>
        <button type="submit" disabled={submitting} className={`btn-serious ${AUTH_BUTTON}`}>
          {submitting ? (<><i className="fas fa-spinner fa-spin" aria-hidden="true" /><span>Ingresando...</span></>) : (<><span>Ingresar al Sistema</span><i className="fas fa-arrow-right text-xs opacity-80" aria-hidden="true" /></>)}
        </button>
      </form>
    </AuthLayout>
  );
}
