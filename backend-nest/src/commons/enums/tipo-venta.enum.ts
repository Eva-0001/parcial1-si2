export enum TipoVenta {
  VIRTUAL = 'virtual',
  PRESENCIAL = 'presencial',
}

export enum ModalidadVenta {
  MENOR = 'menor',
  /** Al menos una linea se cobro con precio por mayor. */
  MAYOR = 'mayor',
}
