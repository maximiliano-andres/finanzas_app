/**
 * Nombre visible del producto. Se cambia aquí y se refleja en toda la interfaz.
 * Nota: el prefijo de rutas `/flujopago/gestion-pagos/v1` (constants.ts) es un contrato con el backend y NO forma parte de la marca.
 */
export const APP_NAME = 'FlujoPago';
export const APP_TAGLINE = 'Solicitud y aprobación de pagos';
export const pageTitle = (section: string) => `${APP_NAME} - ${section}`;
