import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mfaApi, type TrustedDevice } from '@/api/endpoints';
import { qk, useInvalidate } from '@/api/queries';
import { ApiError } from '@/api/client';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/DialogProvider';

/** Sección Seguridad: dispositivos de confianza (security.js). */

/** El backend devuelve datetimes UTC "naive"; se agrega 'Z' solo si no trae zona (corrige B16). */
function parseUtc(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function formatDeviceDate(iso: string | null): string {
  const d = parseUtc(iso);
  return d ? d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
export function deviceStatus(expiresAt: string | null, now = Date.now()): 'expired' | 'expiring' | 'ok' {
  const d = parseUtc(expiresAt);
  if (!d || d.getTime() < now) return 'expired';
  const days = (d.getTime() - now) / 86_400_000;
  return days > 0 && days <= 5 ? 'expiring' : 'ok';
}
export function deviceIcon(name: string | null): string {
  const n = (name || '').toLowerCase();
  if (/ios|iphone|ipad|android/.test(n)) return 'fa-mobile-screen-button';
  if (/macos|mac|windows/.test(n)) return 'fa-desktop';
  if (n.includes('linux')) return 'fa-terminal';
  return 'fa-laptop';
}

export default function SeguridadPage() {
  const devices = useQuery({ queryKey: qk.devices, queryFn: mfaApi.devices, staleTime: 0 });
  const invalidate = useInvalidate();
  const notify = useToast();
  const dialog = useDialog();
  const [revoking, setRevoking] = useState<number | null>(null);

  async function revoke(d: TrustedDevice) {
    const ok = await dialog.confirm('Revocar dispositivo',
      '¿Estás seguro de que deseas revocar este dispositivo?\nDeberás completar el 2FA la próxima vez que inicies sesión desde él.');
    if (!ok) return;
    setRevoking(d.id);
    try {
      await mfaApi.revokeDevice(d.id);
      notify('Dispositivo revocado correctamente.', 'success');
      await invalidate(qk.devices);
    } catch (e) {
      notify(e instanceof ApiError && e.kind === 'http' ? 'No se pudo revocar el dispositivo.' : 'Error de conexión al revocar el dispositivo.', 'error');
    } finally {
      setRevoking(null);
    }
  }

  const list = devices.data ?? [];
  const th = 'text-left px-4 py-3';

  return (
    <section id="sectionSeguridad" className="content-section">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-shield-halved" aria-hidden="true" />Seguridad de la Cuenta</h2>
          <p className="page-subtitle">Gestiona los dispositivos autorizados para el acceso sin código 2FA.</p>
        </div>
      </header>
      <div className="mb-6 rounded-lg border px-4 py-3 bg-[var(--info-bg)] border-[var(--info-border)] flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center"><i className="fas fa-lock text-[var(--info)] text-sm" aria-hidden="true" /></div>
        <div>
          <p className="text-sm font-semibold text-slate-800 mb-1">El 2FA sigue activo en tu cuenta</p>
          <p className="text-sm text-slate-500 leading-relaxed">Los dispositivos de confianza solo omiten el código de verificación en ese dispositivo específico. Si inicias sesión desde un dispositivo nuevo, siempre se solicitará el código 2FA. Puedes revocar cualquier dispositivo en cualquier momento.</p>
        </div>
      </div>
      <div className="ui-card overflow-hidden">
        <div className="ui-card-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center flex-shrink-0"><i className="fas fa-laptop text-sm" aria-hidden="true" /></div>
            <div>
              <h3 className="ui-card-title">Dispositivos de Confianza</h3>
              <p className="text-slate-500 text-xs">Dispositivos autorizados para omitir el 2FA</p>
            </div>
          </div>
          <button id="btnRefreshDevices" type="button" title="Actualizar lista" aria-label="Actualizar lista" onClick={() => void devices.refetch()} disabled={devices.isFetching}
            className="ui-btn ui-btn-secondary ui-btn-sm">
            <i className={`fas fa-sync-alt ${devices.isFetching ? 'fa-spin' : ''}`} aria-hidden="true" /><span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        {devices.isLoading ? (
          <div id="devicesLoading" className="p-10 text-center" role="status">
            <span className="inline-flex items-center gap-3 text-sm text-slate-500"><span className="spinner" aria-hidden="true" /><span>Cargando dispositivos...</span></span>
          </div>
        ) : list.length === 0 ? (
          <div id="devicesEmpty" className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4"><i className="fas fa-laptop text-slate-400 text-2xl" aria-hidden="true" /></div>
            <h4 className="font-semibold text-slate-800 mb-2">Sin dispositivos de confianza</h4>
            <p className="text-slate-500 text-sm max-w-xs mx-auto">Aún no has marcado ningún dispositivo como confiable. La próxima vez que inicies sesión, activa la opción «Confiar en este dispositivo».</p>
            {devices.isError && <p className="text-[var(--danger)] text-xs mt-3">No se pudo cargar la lista de dispositivos.</p>}
          </div>
        ) : (
          <div id="devicesTableContainer">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr><th className={th}>Dispositivo</th><th className={th}>Autorizado el</th><th className={th}>Vence el</th><th className={th}>Último uso</th><th className={`${th} !text-center`}>Acción</th></tr>
                </thead>
                <tbody id="devicesTableBody">
                  {list.map((d) => {
                    const st = deviceStatus(d.expires_at);
                    return (
                      <tr key={d.id} data-device-id={d.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-primary-soft flex items-center justify-center flex-shrink-0"><i className={`fas ${deviceIcon(d.device_name)} text-primary text-sm`} aria-hidden="true" /></div>
                            <p className="font-semibold text-slate-800 text-sm">
                              {d.device_name || 'Dispositivo desconocido'}
                              {st === 'expired' && <span className="ml-2 inline-flex items-center gap-1 text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-[var(--danger-bg)] text-[var(--danger)]"><i className="fas fa-circle-exclamation" aria-hidden="true" />Vencido</span>}
                              {st === 'expiring' && <span className="ml-2 inline-flex items-center gap-1 text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]"><i className="fas fa-clock" aria-hidden="true" />Por vencer</span>}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">{formatDeviceDate(d.created_at)}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap"><span className={st === 'expired' ? 'text-[var(--danger)] font-medium' : st === 'expiring' ? 'text-[var(--warning)] font-medium' : 'text-slate-500'}>{formatDeviceDate(d.expires_at)}</span></td>
                        <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">{formatDeviceDate(d.last_used_at)}</td>
                        <td className="px-4 py-3 text-center">
                          <button type="button" id={`revokeBtn-${d.id}`} onClick={() => void revoke(d)} disabled={revoking !== null} title="Revocar dispositivo"
                            className="ui-btn ui-btn-danger-outline ui-btn-sm">
                            {revoking === d.id ? (<><i className="fas fa-spinner fa-spin" aria-hidden="true" />Revocando...</>) : (<><i className="fas fa-trash-can" aria-hidden="true" />Revocar</>)}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
