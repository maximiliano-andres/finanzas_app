import { LOGO_MARK } from '@/config/assets';
import { APP_NAME, APP_TAGLINE } from '@/config/brand';

const SIZES = { sm: 'w-8 h-8 rounded-lg', md: 'w-9 h-9 rounded-[10px]', lg: 'w-12 h-12 rounded-xl', xl: 'w-14 h-14 rounded-2xl' } as const;

/**
 * Isotipo de la marca: la mascota dentro de un recuadro blanco tipo "ícono de aplicación".
 * El recuadro neutro contiene los colores de la ilustración y la integra con la paleta sobria de la interfaz.
 */
export function BrandIcon({ size = 'md', className = '' }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span className={`${SIZES[size]} shrink-0 inline-flex items-center justify-center bg-[#fff] ring-1 ring-black/[0.06] shadow-sm overflow-hidden ${className}`}>
      <img src={LOGO_MARK} alt="" className="w-[88%] h-[88%] object-contain" draggable={false} />
    </span>
  );
}

/** Isotipo + logotipo de texto (nombre del producto + descripción). `tone` según el fondo donde se ubica. */
export function BrandLockup({ size = 'md', tone = 'light', subtitle = APP_TAGLINE, iconOnly = false, className = '' }: {
  size?: keyof typeof SIZES; tone?: 'light' | 'dark'; subtitle?: string; iconOnly?: boolean; className?: string;
}) {
  const dark = tone === 'dark';
  return (
    <span className={`inline-flex items-center gap-3 min-w-0 ${className}`} role="img" aria-label={`${APP_NAME} · ${subtitle}`}>
      <BrandIcon size={size} />
      {!iconOnly && (
        <span className="flex flex-col min-w-0 leading-tight" aria-hidden="true">
          <span className={`font-semibold tracking-tight ${size === 'lg' || size === 'xl' ? 'text-lg' : 'text-[0.9375rem]'} ${dark ? 'text-white' : 'text-slate-900'}`}>{APP_NAME}</span>
          <span className={`text-[0.6875rem] truncate ${dark ? 'text-[#9AA6B2]' : 'text-slate-500'}`}>{subtitle}</span>
        </span>
      )}
    </span>
  );
}
