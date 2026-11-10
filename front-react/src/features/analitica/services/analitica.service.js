import { http } from '@/core/api/http'

/** Módulo de analítica inteligente (Machine Learning) del backend. */
export const analiticaService = {
  resumen() {
    return http.get('/ml/resumen')
  },

  /** Entrena demanda (Random Forest) y segmentos (K-means). Tarda varios segundos. */
  entrenar(regenerar = false) {
    return http.post('/ml/entrenar', { regenerar }, { timeout: 180000 })
  },
}
