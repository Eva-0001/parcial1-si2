export enum MetodoPago {
  EFECTIVO = 'efectivo',
  TARJETA = 'tarjeta',
  QR = 'qr',
  /** Se paga en efectivo al recibir el pedido en el domicilio. */
  CONTRAENTREGA = 'contraentrega',
}

/** Metodos que se cobran en la caja de una sucursal. */
export const METODOS_DE_CAJA: readonly MetodoPago[] = [
  MetodoPago.EFECTIVO,
  MetodoPago.TARJETA,
  MetodoPago.QR,
];

export enum TipoMovimientoCaja {
  INGRESO = 'ingreso',
  EGRESO = 'egreso',
}
