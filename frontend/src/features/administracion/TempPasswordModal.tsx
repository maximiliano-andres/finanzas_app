import { createPortal } from 'react-dom';
import { useState } from 'react';
import { ApiError } from '@/api/client';
import { usuariosApi } from '@/api/endpoints';
import { useToast } from '@/components/feedback/ToastProvider';

export interface TempPasswordData { id: number; nombre_1: string; apellido_1: string; email: string; temp_password: string }

/** #tempPasswordModal (admin.js:923-1025): muestra la contraseña temporal y permite enviarla por correo. */
export function TempPasswordModal({ data, isReset, onClose }: { data: TempPasswordData; isReset: boolean; onClose: () => void }) {
  const notify = useToast();
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'retry'>('idle');
  const nombre = `${data.nombre_1} ${data.apellido_1}`;

  function copy() {
    void navigator.clipboard?.writeText(data.temp_password).then(() => notify('Contraseña copiada', 'success'));
  }

  async function send() {
    if (sendState === 'sending' || sendState === 'sent') return;
    setSendState('sending');
    try {
      await usuariosApi.sendTempPassword(data.id, { temp_password: data.temp_password, motivo: isReset ? 'restablecimiento' : 'creación' });
      setSendState('sent');
      notify(`Contraseña temporal enviada a ${data.email}`, 'success');
    } catch (e) {
      setSendState('retry');
      // HTTP 200 con status:"error" llega como ApiError http con el `message` del backend (result.message || result.detail).
      if (e instanceof ApiError && e.kind === 'http') notify(e.message || 'No se pudo enviar el correo.', 'error');
      else notify('Error de conexión al enviar el correo.', 'error');
    }
  }

  const sent = sendState === 'sent';
  // Portal: el modal se monta en <body> para no quedar atrapado en el contexto de apilamiento de la sección.
  return createPortal(
    <div id="tempPasswordModal" className="fixed inset-0 z-[9999] bg-slate-950/55 backdrop-blur-[2px] flex items-center justify-center p-0 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="tempPasswordTitle"
        className="bg-white w-full sm:max-w-md max-h-[100dvh] sm:max-h-[90vh] sm:rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden animate-[fadeIn_0.3s_ease]">
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
              <i className="fas fa-key" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="tempPasswordTitle" className="text-lg font-semibold text-slate-900">{isReset ? 'Contraseña Restablecida' : 'Usuario Creado Exitosamente'}</h3>
              <p className="text-sm text-slate-500">Credenciales de acceso inicial</p>
            </div>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">
          <p className="text-slate-600 text-sm">
            {isReset ? <>La contraseña del usuario <strong>{nombre}</strong> ha sido restablecida.</> : <>El usuario <strong>{nombre}</strong> ha sido creado.</>}
            {' '}Comparte estas credenciales de forma segura:
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 font-medium">Correo</span>
              <span className="text-sm font-mono text-slate-700 break-all">{data.email}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 font-medium">Contraseña temporal</span>
              <div className="flex items-center gap-2">
                <span id="tempPassValue" className="text-base font-mono font-semibold text-slate-900 tracking-wider bg-white border border-[var(--border)] px-3 py-1 rounded-md">{data.temp_password}</span>
                <button type="button" onClick={copy} className="ui-icon-btn" title="Copiar" aria-label="Copiar contraseña">
                  <i className="fas fa-copy" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-lg border px-4 py-3 text-sm bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning)] flex items-start gap-2">
            <i className="fas fa-exclamation-triangle text-sm mt-0.5" aria-hidden="true" />
            <p className="text-xs"><strong>Esta es la única vez que verás esta contraseña.</strong> Al primer ingreso el sistema le pedirá al usuario que la cambie. Puedes enviarla al correo del usuario con el botón de abajo.</p>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <button type="button" id="sendTempPasswordBtn" data-testid="send-temp-password" onClick={send} disabled={sendState === 'sending' || sent}
            className={`ui-btn ${sent ? 'ui-btn-success' : 'ui-btn-secondary'}`}>
            {sendState === 'sending' && <><i className="fas fa-spinner fa-spin text-xs" aria-hidden="true" /> Enviando...</>}
            {sent && <><i className="fas fa-check text-xs" aria-hidden="true" /> Enviado</>}
            {sendState === 'retry' && <><i className="fas fa-paper-plane text-xs" aria-hidden="true" /> Reintentar</>}
            {sendState === 'idle' && <><i className="fas fa-paper-plane text-xs" aria-hidden="true" /> Enviar por correo</>}
          </button>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-primary">
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
