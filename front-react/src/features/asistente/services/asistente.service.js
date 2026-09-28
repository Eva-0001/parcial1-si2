import { http } from '@/core/api/http'

export const asistenteService = {
  estado() {
    return http.get('/ia/estado')
  },

  /** `historial`: mensajes anteriores [{ rol: 'cliente' | 'asistente', texto }], del más viejo al más nuevo. */
  consultar(mensaje, sucursalId, historial = []) {
    return http.post('/ia/asistente', {
      mensaje,
      ...(sucursalId ? { sucursal_id: sucursalId } : {}),
      ...(historial.length ? { historial } : {}),
    })
  },
}
