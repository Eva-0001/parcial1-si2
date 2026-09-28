export enum ModalidadEntrega {
  /** El cliente retira el pedido en la sucursal. */
  RETIRO = 'retiro',
  /** Se lleva a la direccion del cliente. */
  DOMICILIO = 'domicilio',
}

export enum EstadoEnvio {
  PENDIENTE = 'pendiente',
  PREPARANDO = 'preparando',
  /** Solo domicilio: salio con el repartidor. */
  EN_CAMINO = 'en_camino',
  /** Solo retiro: esperando en la sucursal. */
  LISTO_RETIRO = 'listo_retiro',
  ENTREGADO = 'entregado',
  CANCELADO = 'cancelado',
}

export enum EstadoPago {
  PAGADO = 'pagado',
  /** Contraentrega todavia no cobrada. */
  PENDIENTE = 'pendiente',
  REEMBOLSADO = 'reembolsado',
}

/** Siguiente estado permitido segun la modalidad. Cancelar se valida aparte. */
export const FLUJO_DE_ENVIO: Record<
  ModalidadEntrega,
  Partial<Record<EstadoEnvio, EstadoEnvio>>
> = {
  [ModalidadEntrega.DOMICILIO]: {
    [EstadoEnvio.PENDIENTE]: EstadoEnvio.PREPARANDO,
    [EstadoEnvio.PREPARANDO]: EstadoEnvio.EN_CAMINO,
    [EstadoEnvio.EN_CAMINO]: EstadoEnvio.ENTREGADO,
  },
  [ModalidadEntrega.RETIRO]: {
    [EstadoEnvio.PENDIENTE]: EstadoEnvio.PREPARANDO,
    [EstadoEnvio.PREPARANDO]: EstadoEnvio.LISTO_RETIRO,
    [EstadoEnvio.LISTO_RETIRO]: EstadoEnvio.ENTREGADO,
  },
};

export const ESTADOS_FINALES: readonly EstadoEnvio[] = [
  EstadoEnvio.ENTREGADO,
  EstadoEnvio.CANCELADO,
];
