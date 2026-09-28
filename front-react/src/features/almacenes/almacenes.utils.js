export const TIPOS_MOVIMIENTO = {
  ingreso: {
    etiqueta: 'Ingreso',
    titulo: 'Ingreso de mercadería',
    icono: 'move_to_inbox',
    chip: 'bg-success/10 text-success',
  },
  envio: {
    etiqueta: 'Envío',
    titulo: 'Enviar a sucursal',
    icono: 'local_shipping',
    chip: 'bg-sky-100 text-sky-800',
  },
  devolucion: {
    etiqueta: 'Devolución',
    titulo: 'Devolución desde sucursal',
    icono: 'assignment_return',
    chip: 'bg-amber-100 text-amber-800',
  },
}

/** Nombre del producto con talla y color, para distinguir variantes en listas. */
export function etiquetaProducto(producto, referencias) {
  if (!producto) return '—'
  const extras = [referencias.nombre('tallas', producto.talla_id), referencias.nombre('colores', producto.color_id)]
    .filter(Boolean)
    .join(' · ')
  return extras ? `${producto.nombre} (${extras})` : producto.nombre
}
