import { http, limpiarParams } from '@/core/api/http'
import { monedaBs } from '@/shared/utils/moneda-bs'

export const MOTIVOS_DE_CAMBIO = [
  { valor: 'talla', etiqueta: 'Talla incorrecta' },
  { valor: 'color', etiqueta: 'Otro color' },
  { valor: 'defecto', etiqueta: 'Defecto de fábrica' },
  { valor: 'no_le_gusto', etiqueta: 'No le gustó' },
  { valor: 'otro', etiqueta: 'Otro motivo' },
]

export const etiquetaMotivo = (valor) => MOTIVOS_DE_CAMBIO.find((m) => m.valor === valor)?.etiqueta ?? valor

/** Cambios de prendas dentro del plazo de la empresa. */
export const cambiosService = {
  listar(ventaId) {
    return http.get('/cambios', {
      params: limpiarParams({ venta_id: ventaId }),
    })
  },

  obtener(id) {
    return http.get(`/cambios/${id}`)
  },

  /** Plazo, líneas cambiables y prendas disponibles de una venta. */
  paraVenta(ventaId) {
    return http.get(`/cambios/venta/${ventaId}`)
  },

  crear(datos) {
    return http.post('/cambios', datos)
  },
}

/** Texto de la diferencia: positiva la paga el cliente, negativa queda a su favor. */
export function textoDiferencia(diferencia) {
  const d = Number(diferencia)
  if (d > 0) return { texto: `Cliente pagó ${monedaBs(d)}`, clase: 'text-on-surface' }
  if (d < 0) return { texto: `Saldo a favor ${monedaBs(-d)}`, clase: 'text-primary' }
  return { texto: 'Sin diferencia', clase: 'text-on-surface-variant' }
}
