/** Reglas de validación (cliente) — réplica de index_login.js y validaciones.py del backend. */

/** Dominios permitidos en login (index_login.js:24-36). El backend aplica su propia lista (validaciones.py). */
/** Correos fuera de los dominios corporativos autorizados explícitamente (mantener igual a validaciones.py). */
const EMAILS_AUTORIZADOS = ['casa2301teo@gmail.com', 'max.anti10@gmail.com'];

export function isAllowedLoginEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith('@flujopago.cl') || e.endsWith('@grupodemo.cl') || e.endsWith('@pushhr.cl') || EMAILS_AUTORIZADOS.includes(e);
}

/** Reglas de contraseña del backend (validaciones.py validate_password), mostradas antes de enviar. */
export const SYMBOL_REGEX = /[!@#$%^&*()_\-+=[\]{};:,.?/<>|~]/;
export function passwordProblems(p: string): string[] {
  const errs: string[] = [];
  if (p.length < 8) errs.push('La contraseña debe tener al menos 8 caracteres.');
  if (!/[A-Z]/.test(p)) errs.push('Debe contener al menos una letra mayúscula.');
  if (!/[0-9]/.test(p)) errs.push('Debe contener al menos un número.');
  if (!SYMBOL_REGEX.test(p)) errs.push('Debe contener al menos un símbolo especial.');
  return errs;
}

/** Mensaje legible de errores 422 de FastAPI (data.js parseError: quita "Value error, " y une con ", "). */
export function parsePydanticErrors(detail: unknown): string | null {
  if (!Array.isArray(detail)) return typeof detail === 'string' ? detail : null;
  const msgs = detail.map((d: { msg?: string }) => String(d?.msg ?? '').replace(/^Value error, /, '')).filter(Boolean);
  return msgs.length ? msgs.join(', ') : null;
}
