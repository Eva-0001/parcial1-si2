import { SetMetadata } from '@nestjs/common';

export const ACCESO_PLATAFORMA = 'acceso_plataforma';

export type AccesoPlataforma = 'solo' | 'tambien';

/** Ruta exclusiva del superadmin de la plataforma SaaS. */
export const SoloPlataforma = () => SetMetadata(ACCESO_PLATAFORMA, 'solo');

/**
 * Ruta de empresa que el superadmin tambien puede usar (ej. /auth/me). El resto
 * de rutas de empresa le quedan cerradas: el superadmin no opera tiendas.
 */
export const TambienPlataforma = () => SetMetadata(ACCESO_PLATAFORMA, 'tambien');
