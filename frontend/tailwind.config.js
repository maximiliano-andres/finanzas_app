/**
 * FlujoPago · Sistema de diseño 2026 (Tailwind compilado en build).
 *
 * Paleta de marca (imagen de referencia):
 *   #FFFFFF  superficie      #F1F3F5  fondo de la app
 *   #6C7A89  acero (secund.) #2C3E50  primario (navy)     #1A252F  tinta (texto / navegación)
 *
 * Las escalas `slate`/`gray` (neutros) y `purple`/`indigo`/`violet` (marca) se reanclan a la paleta para que TODO el
 * frontend herede la nueva identidad sin tocar lógica: una clase existente como `text-slate-700` o `bg-purple-100`
 * ahora produce el tono equivalente de la paleta. `blue` se conserva como tono "informativo" (columnas de Finanzas),
 * desaturado para convivir con el navy. Verde/rojo/ámbar mantienen su rol semántico (éxito/error/advertencia).
 */
const neutral = {
  50: '#F7F8FA',
  100: '#F1F3F5', // paleta: fondo
  200: '#E3E7EB',
  300: '#CDD3DA',
  400: '#8A96A3',
  500: '#637181', // ≈ #6C7A89 de la paleta, ajustado a contraste AA (4.8:1) para texto secundario
  600: '#4F5C6A',
  700: '#3B4A59',
  800: '#2C3E50', // paleta: primario
  900: '#1A252F', // paleta: tinta
  950: '#10171E',
};

const brand = {
  50: '#F2F5F8',
  100: '#E3E9EF',
  200: '#C8D3DE',
  300: '#A0B1C2',
  400: '#6F869D',
  500: '#4A6279',
  600: '#3A5068',
  700: '#2C3E50', // paleta: primario
  800: '#233241',
  900: '#1A252F', // paleta: tinta
  950: '#121A21',
};

const info = {
  50: '#F0F5FA',
  100: '#DFEAF5',
  200: '#BFD4EA',
  300: '#93B6D9',
  400: '#5F90C0',
  500: '#3B73A8',
  600: '#2E5F8F',
  700: '#264E75',
  800: '#1F3F5E',
  900: '#1A334B',
  950: '#122436',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Tokens semánticos (uso preferente en código nuevo)
        primary: { DEFAULT: '#2C3E50', hover: '#233241', soft: '#E3E9EF' },
        ink: '#1A252F',
        steel: '#6C7A89',
        mist: '#F1F3F5',
        surface: '#FFFFFF',
        // Alias históricos de marca → remapeados a la nueva paleta (sin cambiar nombres de clase en el código)
        'purple-heart': '#2C3E50',
        shakespeare: '#6C7A89',
        casablanca: '#B7791F',
        'dark-slate': '#1A252F',
        slate: neutral,
        gray: neutral,
        purple: brand,
        indigo: brand,
        violet: brand,
        blue: info,
        sky: info,
        cyan: info,
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      // Jerarquía tipográfica sobria: los pesos extremos (900) se suavizan.
      fontWeight: { black: '700', extrabold: '700' },
      letterSpacing: { tighter: '-0.02em', wider: '0.04em', widest: '0.06em' },
      // Radios contenidos y consistentes (controles 8–10px, tarjetas 12px, modales 16px).
      borderRadius: { xl: '0.625rem', '2xl': '0.75rem', '3xl': '1rem' },
      // Sombras suaves: profundidad solo donde aporta (tarjetas casi planas, modales elevados).
      boxShadow: {
        sm: '0 1px 2px 0 rgb(16 24 32 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(16 24 32 / 0.07), 0 1px 2px -1px rgb(16 24 32 / 0.05)',
        md: '0 2px 6px -1px rgb(16 24 32 / 0.08), 0 1px 3px -1px rgb(16 24 32 / 0.05)',
        lg: '0 1px 2px 0 rgb(16 24 32 / 0.04), 0 2px 8px -2px rgb(16 24 32 / 0.08)',
        xl: '0 12px 28px -8px rgb(16 24 32 / 0.18), 0 4px 10px -4px rgb(16 24 32 / 0.08)',
        '2xl': '0 24px 48px -12px rgb(16 24 32 / 0.28)',
        inner: 'inset 0 1px 2px 0 rgb(16 24 32 / 0.05)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.35s ease-out both',
      },
      keyframes: {
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
