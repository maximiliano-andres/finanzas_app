import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { mfaApi, type MfaSetup } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { AuthHeading, AuthLayout, AUTH_BUTTON, AUTH_CODE_INPUT, AUTH_LABEL, AUTH_LINK } from '@/components/layout/AuthLayout';
import { pageTitle } from '@/config/brand';
import { useToast } from '@/components/feedback/ToastProvider';
import { SESSION_KEY } from '@/auth/AuthProvider';

type Mode = 'loading' | 'setup' | 'verify' | 'backup' | 'error';

const CODE_INPUT = AUTH_CODE_INPUT;

export default function MfaPage() {
  const [mode, setMode] = useState<Mode>('loading');
  const [subtitle, setSubtitle] = useState('Cargando estado de seguridad...');
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [busy, setBusy] = useState<null | 'setup' | 'verify' | 'backup' | 'email'>(null);
  const [emailSent, setEmailSent] = useState(false);
  const started = useRef(false);
  const notify = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    // Evita doble llamada a /mfa/setup (StrictMode / re-montajes): cada llamada regenera el secreto en el backend.
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const info = await mfaApi.status();
        if (info.must_change_password) { navigate('/force-change', { replace: true }); return; }
        if (info.mfa_enabled) {
          setSubtitle('Ingresa tu código TOTP o solicita uno por correo');
          setMode('verify');
        } else {
          setSubtitle('Debes configurar tu Segundo Factor de Autenticación para continuar');
          setMode('setup');
          try {
            setSetup(await mfaApi.setup());
          } catch (e) {
            // Mejora: el original ignoraba este error silenciosamente.
            notify(e instanceof ApiError ? e.message : 'Error al conectar con el servidor', 'error');
          }
        }
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { navigate('/login', { replace: true }); return; }
        // Mejora: el original quedaba en "Cargando estado de seguridad..." sin feedback.
        setMode('error');
        setSubtitle('No se pudo cargar el estado de seguridad. Recargue la página o intente más tarde.');
      }
    })();
  }, [navigate, notify]);

  const finish = (msg: string, delay: number) => {
    notify(msg, 'success');
    setTimeout(async () => {
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      navigate('/', { replace: true });
    }, delay);
  };

  const failMsg = (e: unknown, fallback: string) =>
    e instanceof ApiError && e.kind === 'http' ? (e.body?.message || fallback) : 'Error al conectar con el servidor';

  async function onSetup(e: FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy('setup');
    try {
      await mfaApi.verifySetup(code.trim());
      finish('2FA activado y verificado correctamente', 1200);
    } catch (err) {
      notify(failMsg(err, 'Código incorrecto'), 'error');
      setBusy(null);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy('verify');
    try {
      await mfaApi.verify(code.trim());
      finish('Identidad verificada correctamente', 800);
    } catch (err) {
      notify(failMsg(err, 'Código incorrecto'), 'error');
      setBusy(null);
    }
  }

  async function onBackup(e: FormEvent) {
    e.preventDefault();
    if (busy || !backupCode) return;
    setBusy('backup');
    try {
      await mfaApi.verifyBackup(backupCode);
      finish('Ingreso de emergencia exitoso', 800);
    } catch (err) {
      notify(failMsg(err, 'Código de respaldo incorrecto'), 'error');
      setBusy(null);
    }
  }

  async function sendEmail() {
    if (busy) return;
    setBusy('email');
    try {
      const env = await mfaApi.sendEmailOtp();
      if (env.status === 'success') {
        notify(env.message || 'Código enviado', 'success');
        setEmailSent(true);
      } else {
        notify(env.message || 'Error al enviar correo', 'error');
      }
    } catch (err) {
      notify(err instanceof ApiError && err.kind === 'http' ? err.message || 'Error al enviar correo' : 'Error de red al solicitar código', 'error');
    } finally {
      setBusy(null);
    }
  }

  const emailBtnContent = (label: string) =>
    busy === 'email' ? (<><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Enviando...</>) : (<><i className="fas fa-envelope" aria-hidden="true" /> {label}</>);

  return (
    <AuthLayout title={pageTitle('Seguridad 2FA')} heading="Seguridad de" highlight="nivel empresarial"
      description="El acceso a sus operaciones financieras está protegido. Por favor verifique su identidad.">
      <AuthHeading id="mfa-title" title="Autenticación 2FA" subtitle={subtitle} subtitleId="mfa-subtitle" />
      {mode === 'loading' && (
        <span className="spinner spinner-large" role="status" aria-label="Cargando" />
      )}

      {mode === 'setup' && (
        <div id="mfaSetupSection" className="space-y-6">
          <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-sm text-slate-700 mb-4 font-medium flex gap-2"><span className="w-5 h-5 shrink-0 rounded-full bg-primary text-white text-[0.6875rem] font-semibold flex items-center justify-center">1</span>Escanea este código QR con Google Authenticator o Authy</p>
            {setup?.qr_code_base64 && (
              <img id="qrCodeImg" src={setup.qr_code_base64} alt="Código QR para configurar 2FA" className="mx-auto rounded-lg border border-slate-200 bg-white p-2 w-44 h-44" />
            )}
            <div className="mt-5 text-left">
              <p className="text-sm text-slate-700 mb-2 font-medium flex gap-2"><span className="w-5 h-5 shrink-0 rounded-full bg-primary text-white text-[0.6875rem] font-semibold flex items-center justify-center">2</span>Guarda tus códigos de recuperación en un lugar seguro</p>
              <div id="backupCodesList" className="bg-white border border-slate-200 p-4 rounded-lg font-mono text-[0.8125rem] text-slate-700 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {setup?.backup_codes.map((c) => <p key={c}>{c}</p>)}
              </div>
            </div>
          </div>
          <form id="setupForm" className="space-y-4" onSubmit={onSetup}>
            <div>
              <label htmlFor="setupCode" className={AUTH_LABEL}>
                {emailSent ? 'Ingresa el código de App o Correo' : '3. Ingresa el código de 6 dígitos generado por tu app'}
              </label>
              <input type="text" id="setupCode" required maxLength={6} placeholder="000000" inputMode="numeric" autoComplete="one-time-code"
                value={code} onChange={(e) => setCode(e.target.value)} className={CODE_INPUT} />
            </div>
            <button type="submit" disabled={busy !== null} className={AUTH_BUTTON}>
              {busy === 'setup' ? (<><i className="fas fa-spinner fa-spin" aria-hidden="true" />Verificando...</>) : (<><i className="fas fa-shield-halved" aria-hidden="true" />Activar 2FA</>)}
            </button>
          </form>
          <div className="text-center">
            <button id="sendSetupEmailOtpBtn" type="button" onClick={sendEmail} disabled={busy !== null} className={AUTH_LINK}>
              {emailBtnContent('O solicita un código por Correo')}
            </button>
          </div>
        </div>
      )}

      {mode === 'verify' && (
        <div id="mfaVerifySection" className="space-y-6">
          <form id="verifyForm" className="space-y-5" onSubmit={onVerify}>
            <div>
              <label htmlFor="verifyCode" className={AUTH_LABEL}>
                {emailSent ? 'Ingresa el código de App o Correo' : 'Ingresa el código de Google Authenticator'}
              </label>
              <input type="text" id="verifyCode" required maxLength={6} placeholder="000000" inputMode="numeric" autoComplete="one-time-code"
                value={code} onChange={(e) => setCode(e.target.value)} className={CODE_INPUT} />
            </div>
            <button type="submit" disabled={busy !== null} className={AUTH_BUTTON}>
              {busy === 'verify' ? (<><i className="fas fa-spinner fa-spin" aria-hidden="true" />Verificando...</>) : (<><i className="fas fa-shield-halved" aria-hidden="true" /> Validar Identidad</>)}
            </button>
          </form>
          <div className="flex flex-col items-center gap-3 pt-5 border-t border-slate-200">
            <button id="sendEmailOtpBtn" type="button" onClick={sendEmail} disabled={busy !== null} className={AUTH_LINK}>
              {emailBtnContent('Enviar código por Correo')}
            </button>
            <button id="useBackupBtn" type="button" onClick={() => setMode('backup')} className="text-sm text-slate-500 hover:text-slate-800 hover:underline underline-offset-4">
              ¿Perdiste tu dispositivo? Usar código de recuperación
            </button>
          </div>
        </div>
      )}

      {mode === 'backup' && (
        <div id="mfaBackupSection" className="space-y-6">
          <form id="verifyBackupForm" className="space-y-5" onSubmit={onBackup}>
            <div>
              <label htmlFor="verifyBackupCode" className={AUTH_LABEL}>Ingresa uno de tus códigos de recuperación</label>
              <input type="text" id="verifyBackupCode" required placeholder="XXXX-XXXX" autoComplete="off"
                value={backupCode} onChange={(e) => setBackupCode(e.target.value)}
                className={`${AUTH_CODE_INPUT} !text-xl !tracking-[0.2em]`} />
            </div>
            <button type="submit" disabled={busy !== null} className={AUTH_BUTTON}>
              {busy === 'backup' ? (<><i className="fas fa-spinner fa-spin" aria-hidden="true" />Verificando...</>) : (<><i className="fas fa-key" aria-hidden="true" />Ingresar con Respaldo</>)}
            </button>
          </form>
          <div className="text-center">
            <button id="backToVerifyBtn" type="button" onClick={() => setMode('verify')} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 hover:underline underline-offset-4"><i className="fas fa-arrow-left text-xs" aria-hidden="true" />Volver al código normal</button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
