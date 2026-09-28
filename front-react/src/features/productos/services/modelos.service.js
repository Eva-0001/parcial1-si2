import { http, limpiarParams } from '@/core/api/http'

/** Productos base (modelos). Sus variantes (talla x color) son los `productos`. */
export const modelosService = {
  listar(filtros = {}) {
    return http.get('/modelos', { params: limpiarParams(filtros) })
  },

  obtener(id) {
    return http.get(`/modelos/${id}`)
  },

  crear(datos) {
    return http.post('/modelos', datos)
  },

  actualizar(id, datos) {
    return http.put(`/modelos/${id}`, datos)
  },

  eliminar(id) {
    return http.delete(`/modelos/${id}`)
  },

  agregarVariante(id, datos) {
    return http.post(`/modelos/${id}/variantes`, datos)
  },
}
