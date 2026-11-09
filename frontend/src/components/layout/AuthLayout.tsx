import { useEffect, useState, type ReactNode } from 'react';
import { BrandLockup } from '@/components/ui/BrandMark';

/**
 * Estructura común de Login / Cambio de contraseña / 2FA.
 * ≥1024px: panel de marca (mensaje + vista del producto) | panel de formulario. <1024px: solo el formulario, con la marca arriba.
 * El panel de formulario se cierra con una nota de seguridad para que el formulario no "flote" en un campo vacío.
 */
export function AuthLayout({ title, heading, highlight, description, card, children }: {
  title: string; heading: string; highlight: string; description: string; card?: ReactNode; children: ReactNode;
}) {
  useEffect(() => { document.title = title; }, [title]);
  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden bg-ink text-white border-r border-white/5" aria-hidden="true">
          {/* Textura sutil: rejilla tenue que se desvanece hacia abajo + halo navy (sin animaciones) */}
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255/.6)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/.6)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          <div className="absolute -top-40 -right-40 w-[36rem] h-[36rem] rounded-full bg-primary/70 blur-3xl" />
          <div className="relative z-10 flex flex-col justify-between gap-10 w-full px-12 py-10 xl:px-16 2xl:p-24">
            <BrandLockup size="lg" tone="dark" className="self-start" />
            <div className="max-w-xl animate-fade-in-up">
              <h1 className="text-4xl xl:text-5xl font-semibold leading-[1.1] tracking-tight mb-4 text-balance">
                {heading} <span className="text-[#A0B1C2]">{highlight}</span>
              </h1>
              <p className="text-lg text-[#B6C0CA] leading-relaxed text-pretty">{description}</p>
              {card}
            </div>
            <span className="text-xs text-[#8A96A3] tracking-wide">© 2026 Maximiliano Andres</span>
          </div>
        </aside>
        <main className="auth-panel w-full lg:w-1/2 xl:w-[45%] flex flex-col bg-white px-5 sm:px-12 xl:px-20">
          <div className="flex-1 flex flex-col justify-center items-center py-8 sm:py-10">
            <div className="w-full max-w-[26.25rem] animate-fade-in-up">
              {/* Marca en móvil/tablet: misma alineación que el formulario (a la izquierda), separada por una línea */}
              <div className="lg:hidden mb-6 pb-5 sm:mb-8 sm:pb-6 border-b border-[var(--border)]">
                <BrandLockup size="lg" />
              </div>
              {children}
            </div>
          </div>
          <footer className="w-full max-w-[26.25rem] mx-auto py-6 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2">
              <i className="fas fa-lock text-[0.6875rem] text-slate-400" aria-hidden="true" />
              Conexión cifrada · Acceso solo para personal autorizado
            </span>
            <span className="lg:hidden">© 2026 Maximiliano Andres</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

/** Encabezado del formulario de autenticación (etiqueta opcional + título + texto de apoyo). */
export function AuthHeading({ id, title, subtitle, subtitleId, eyebrow }: {
  id?: string; title: string; subtitle: ReactNode; subtitleId?: string; eyebrow?: { icon: string; text: string };
}) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <span className="inline-flex items-center gap-1.5 mb-4 px-2.5 py-1 rounded-full bg-[var(--primary-soft)] text-[var(--accent)] text-xs font-semibold">
          <i className={`fas ${eyebrow.icon} text-[0.6875rem]`} aria-hidden="true" />{eyebrow.text}
        </span>
      )}
      <h2 id={id} className="text-[1.75rem] font-semibold text-slate-900 tracking-tight mb-2">{title}</h2>
      <p id={subtitleId} className="text-slate-500 text-[0.9375rem] leading-relaxed" aria-live={subtitleId ? 'polite' : undefined}>{subtitle}</p>
    </div>
  );
}

export const AUTH_LABEL = 'block text-sm font-medium text-slate-700 mb-1.5';

export const AUTH_INPUT =
  'w-full h-12 pl-11 pr-4 bg-white border border-slate-300 rounded-lg text-[0.9375rem] text-slate-900 placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 hover:border-slate-400 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/25';

export const AUTH_CODE_INPUT =
  'w-full h-14 px-4 text-center font-mono text-2xl tracking-[0.5em] bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-300 transition-[border-color,box-shadow] duration-150 hover:border-slate-400 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/25';

export const AUTH_BUTTON =
  'ui-btn ui-btn-primary ui-btn-lg w-full !h-12 disabled:!opacity-70 disabled:cursor-wait';

export const AUTH_LINK =
  'inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4 disabled:opacity-60 disabled:no-underline';

export function PasswordInput({ id, value, onChange, placeholder = '••••••••', icon = 'fa-lock', autoComplete, required = true }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; icon?: string; autoComplete?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
        <i className={`fas ${icon} text-sm`} aria-hidden="true" />
      </div>
      <input type={show ? 'text' : 'password'} id={id} name={id} required={required} placeholder={placeholder} autoComplete={autoComplete}
        value={value} onChange={(e) => onChange(e.target.value)} className={`${AUTH_INPUT} !pr-12`} />
      <button type="button" id={`toggle_${id}`} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={show}
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-1 my-auto ui-icon-btn !w-10 !h-10 text-slate-400 hover:text-slate-700">
        <i className={`fas ${show ? 'fa-eye-slash' : 'fa-eye'} text-sm`} aria-hidden="true" />
      </button>
    </div>
  );
}
