export const ESTADO_ENVIO = {
  pendiente: { etiqueta: 'Pendiente', icono: 'schedule', chip: 'bg-surface-container-low text-on-surface-variant' },
  preparando: { etiqueta: 'En preparación', icono: 'inventory', chip: 'bg-sky-100 text-sky-800' },
  en_camino: { etiqueta: 'En camino', icono: 'local_shipping', chip: 'bg-violet-100 text-violet-800' },
  listo_retiro: { etiqueta: 'Listo para retirar', icono: 'storefront', chip: 'bg-amber-100 text-amber-800' },
  entregado: { etiqueta: 'Entregado', icono: 'task_alt', chip: 'bg-success/10 text-success' },
  cancelado: { etiqueta: 'Cancelado', icono: 'cancel', chip: 'bg-error/10 text-error' },
}

/** Pasos que ve el cliente, en orden, según cómo recibe el pedido. */
export const PASOS_ENVIO = {
  domicilio: ['pendiente', 'preparando', 'en_camino', 'entregado'],
  retiro: ['pendiente', 'preparando', 'listo_retiro', 'entregado'],
}

/** Texto del botón que lleva al siguiente estado. */
export const ACCION_SIGUIENTE = {
  preparando: 'Empezar a preparar',
  en_camino: 'Despachar al repartidor',
  listo_retiro: 'Marcar listo para retirar',
  entregado: 'Marcar entregado',
}

export const ETIQUETA_MODALIDAD = { domicilio: 'Envío a domicilio', retiro: 'Retiro en sucursal' }

export const ETIQUETA_METODO_PAGO = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  qr: 'QR',
  contraentrega: 'Contraentrega',
}

export const ESTADO_PAGO = {
  pagado: { etiqueta: 'Pagado', chip: 'bg-success/10 text-success' },
  pendiente: { etiqueta: 'Por cobrar', chip: 'bg-amber-100 text-amber-800' },
  reembolsado: { etiqueta: 'Reembolsado', chip: 'bg-surface-container-low text-on-surface-variant' },
}

/** Estado del pago para mostrar: un QR pendiente está "por verificar", no "por cobrar". */
export function estadoDePago(venta) {
  if (venta?.metodo_pago === 'qr' && venta.estado_pago === 'pendiente') {
    return { etiqueta: 'Por verificar', chip: 'bg-amber-100 text-amber-800' }
  }
  return ESTADO_PAGO[venta?.estado_pago] ?? null
}

export const qrPorVerificar = (venta) => venta?.metodo_pago === 'qr' && venta.estado_pago === 'pendiente'

export const contraentregaPorCobrar = (venta) =>
  venta?.metodo_pago === 'contraentrega' && venta.estado_pago === 'pendiente'

export function siguienteEstado(envio) {
  const pasos = PASOS_ENVIO[envio.modalidad]
  const i = pasos.indexOf(envio.estado)
  return i >= 0 && i < pasos.length - 1 ? pasos[i + 1] : null
}

export const estaActivo = (envio) => !['entregado', 'cancelado'].includes(envio.estado)
