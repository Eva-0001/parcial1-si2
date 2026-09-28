import { http } from '@/core/api/http'

export const ventasService = {
  listar(filtros = {}) {
    const params = {}
    if (filtros.usuario_id !== undefined) params.usuario_id = filtros.usuario_id
    if (filtros.tipo_venta) params.tipo_venta = filtros.tipo_venta
    return http.get('/ventas', { params })
  },

  obtener(id) {
    return http.get(`/ventas/${id}`)
  },

  obtenerVarias(ids) {
    if (ids.length === 0) return Promise.resolve([])
    return Promise.all(ids.map((id) => this.obtener(id)))
  },

  crear(datos, opciones = {}) {
    return http.post('/ventas', datos, opciones)
  },

  /** Foto del comprobante del pago por QR (la sube el cliente). */
  subirComprobantePago(id, archivo) {
    const form = new FormData()
    form.append('archivo', archivo)
    return http.post(`/ventas/${id}/comprobante-pago`, form)
  },

  /** El comprobante es privado: se descarga con el token y se devuelve como Blob. */
  comprobantePago(id) {
    return http.get(`/ventas/${id}/comprobante-pago`, { responseType: 'blob' })
  },

  corregirTipo(id, tipo_venta) {
    return http.put(`/ventas/${id}`, { tipo_venta })
  },

  anular(id) {
    return http.delete(`/ventas/${id}`).then(() => undefined)
  },
}
