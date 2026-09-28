import { loadStripe } from '@stripe/stripe-js'
import { http } from '@/core/api/http'
import { env } from '@/config/env'

let stripeCargado = null

export const pagosService = {
  habilitado: !!env.stripePublishableKey,

  config() {
    return http.get('/pagos/config')
  },

  crearIntencion(detalles, entrega = null) {
    return http.post('/pagos/intencion', entrega ? { detalles, entrega } : { detalles })
  },

  stripe() {
    if (!this.habilitado) return Promise.resolve(null)
    stripeCargado ??= loadStripe(env.stripePublishableKey)
    return stripeCargado
  },
}
