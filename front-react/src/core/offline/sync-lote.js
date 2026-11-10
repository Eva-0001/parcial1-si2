import { http } from '../api/http'
import { tiendaActual } from '../stores/tienda.store'

/**
 * Envío por lote de las operaciones hechas sin conexión (POST /sync/push).
 * El servidor procesa cada una por separado y devuelve su resultado:
 * confirmada | duplicada | rechazada | conflicto | error.
 */
const DISPOSITIVO = `web-${(typeof navigator !== 'undefined' && navigator.platform) || 'navegador'}`.slice(0, 100)

/** @param {{ id: string, tipo: 'venta' | 'reserva', sucursal_id?: number, intento?: number, datos: object }[]} operaciones */
export async function enviarLote(operaciones) {
  const respuesta = await http.post('/sync/push', {
    dispositivo: DISPOSITIVO,
    operaciones: operaciones.map((o) => ({ ...o, empresa: tiendaActual() })),
  })
  return new Map(respuesta.resultados.map((r) => [r.id, r]))
}

/** El lote no llegó (sin red, sesión vencida o servidor caído): se reintenta después. */
export const esFalloDeEnvio = (e) => e.status === 0 || e.status === 401 || e.status === 429 || e.status >= 500

export const quedoRegistrada = (r) => r?.resultado === 'confirmada' || r?.resultado === 'duplicada'

/** Mensaje para mostrar de una operación rechazada o en conflicto, con el detalle del stock. */
export function mensajeDeRechazo(r) {
  if (r.resultado !== 'conflicto') return r.mensaje
  if (r.codigo === 'PRECIO_CAMBIADO') return r.mensaje
  const detalle = (r.conflicto ?? [])
    .filter((c) => c.disponible < c.pedido)
    .map((c) => `${c.producto ?? `#${c.producto_sucursal_id}`}: se pidieron ${c.pedido}, hay ${c.disponible}`)
    .join('; ')
  return detalle ? `Conflicto de stock: ${detalle}` : r.mensaje
}
