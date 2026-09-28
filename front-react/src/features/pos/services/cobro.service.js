import { comprobantesService } from '@/features/ventas/services/comprobantes.service'
import { unidadesDeVenta } from '@/features/ventas/ventas.utils'

/** Emite el ticket de una venta del POS; si ya tiene comprobante (reintento), lo devuelve. */
export function emitirTicket(venta) {
  if (venta.comprobantes?.length) return Promise.resolve(venta.comprobantes[0])

  return comprobantesService.listar().then((existentes) =>
    comprobantesService.emitir({
      nombre: `Ticket 001-${String(existentes.length + 1).padStart(4, '0')}`,
      cantidad: unidadesDeVenta(venta),
      monto: Number(venta.total).toFixed(2),
      venta_id: venta.id,
    }),
  )
}
