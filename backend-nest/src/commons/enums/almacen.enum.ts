export enum TipoMovimientoAlmacen {
  /** Mercaderia que entra al almacen (compra a proveedor). */
  INGRESO = 'ingreso',
  /** Del almacen hacia el stock de una sucursal. */
  ENVIO = 'envio',
  /** Del stock de una sucursal de vuelta al almacen. */
  DEVOLUCION = 'devolucion',
}
