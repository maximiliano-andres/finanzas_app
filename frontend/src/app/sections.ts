import type { SectionKey } from '@/lib/roles';

/** Menú lateral (dashboard.html:123-183): mismo orden, textos e íconos. Ahora con rutas reales (deep-linking + botón atrás). */
export const SECTIONS: Array<{ key: SectionKey; path: string; label: string; icon: string; menuId?: string }> = [
  { key: 'dashboard', path: '/', label: 'Dashboard', icon: 'fa-home' },
  { key: 'nuevaSolicitud', path: '/nueva-solicitud', label: 'Nueva Solicitud', icon: 'fa-plus-circle', menuId: 'menuNuevaSolicitud' },
  { key: 'misSolicitudes', path: '/mis-solicitudes', label: 'Mis Solicitudes', icon: 'fa-pen-to-square' },
  { key: 'aprobaciones', path: '/aprobaciones', label: 'Aprobación RRHH', icon: 'fa-check-circle', menuId: 'menuAprobaciones' },
  { key: 'aprobaciones2', path: '/aprobaciones2', label: 'Aprobación SCP', icon: 'fa-check-circle', menuId: 'menuAprobaciones2' },
  { key: 'finanzas', path: '/finanzas', label: 'Finanzas', icon: 'fa-dollar-sign', menuId: 'menuFinanzas' },
  { key: 'todasSolicitudes', path: '/todas-solicitudes', label: 'Estados de Solicitudes', icon: 'fa-folder-open', menuId: 'menuTodasSolicitudes' },
  { key: 'recepcionado', path: '/recepcionado', label: 'Solicitudes Recepcionadas', icon: 'fa-chart-column', menuId: 'menuRecepcionado' },
  { key: 'reportes', path: '/reportes', label: 'Reportes', icon: 'fa-chart-bar', menuId: 'menuReportes' },
  { key: 'administracion', path: '/administracion', label: 'Administración', icon: 'fa-cog', menuId: 'menuAdmin' },
  { key: 'seguridad', path: '/seguridad', label: 'Seguridad', icon: 'fa-shield-halved', menuId: 'menuSeguridad' },
];

export const pathFor = (key: SectionKey) => SECTIONS.find((s) => s.key === key)!.path;
