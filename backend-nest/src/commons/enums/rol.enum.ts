export enum Rol {
  ADMINISTRADOR = 'administrador',
  ENCARGADO = 'encargado',
  CAJERO = 'cajero',
  PROVEEDOR = 'proveedor',
  CLIENTE = 'cliente',
}

export const ROLES_DEL_SISTEMA: readonly Rol[] = Object.values(Rol);

export const ROL_POR_DEFECTO = Rol.CLIENTE;

export const CAPACIDAD = {
  catalogo: [Rol.ADMINISTRADOR, Rol.PROVEEDOR],
  inventario: [Rol.ADMINISTRADOR, Rol.ENCARGADO],
  caja: [Rol.ADMINISTRADOR, Rol.CAJERO],
  reservas: [Rol.ADMINISTRADOR, Rol.ENCARGADO],
  pedidos: [Rol.ADMINISTRADOR, Rol.ENCARGADO],
  /** Ver pedidos en linea y aceptar sus pagos (comprobante QR, cobro contraentrega). */
  pagosPedidos: [Rol.ADMINISTRADOR, Rol.ENCARGADO, Rol.CAJERO],
  reportes: [Rol.ADMINISTRADOR, Rol.ENCARGADO, Rol.CAJERO],
  /** Cambios de prendas de una venta dentro del plazo. */
  cambios: [Rol.ADMINISTRADOR, Rol.ENCARGADO, Rol.CAJERO],
  venta: [Rol.ADMINISTRADOR, Rol.ENCARGADO, Rol.CAJERO, Rol.CLIENTE],
} as const satisfies Record<string, readonly Rol[]>;

/**
 * Rol del dueno de la plataforma SaaS. No pertenece a ninguna empresa y no
 * esta en `Rol` a proposito: los roles de `Rol` se crean dentro de cada empresa.
 */
export const ROL_SUPERADMIN = 'superadmin';
