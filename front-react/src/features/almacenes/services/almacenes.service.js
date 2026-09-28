import { http } from '@/core/api/http'

export const almacenesService = {
  listar() {
    return http.get('/almacenes')
  },

  obtener(id) {
    return http.get(`/almacenes/${id}`)
  },

  crear(datos) {
    return http.post('/almacenes', datos)
  },

  actualizar(id, datos) {
    return http.put(`/almacenes/${id}`, datos)
  },

  eliminar(id) {
    return http.delete(`/almacenes/${id}`)
  },

  stock(id) {
    return http.get(`/almacenes/${id}/stock`)
  },

  movimientos(id) {
    return http.get(`/almacenes/${id}/movimientos`)
  },

  registrarMovimiento(id, datos) {
    return http.post(`/almacenes/${id}/movimientos`, datos)
  },
}
