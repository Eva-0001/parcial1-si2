import { http } from '../api/http'
import { useAuthStore } from '../stores/auth.store'
import { cambiarTienda } from '../stores/tienda.store'

export const authService = {
  /**
   * Devuelve la respuesta con `cambioDeTienda: true` si el usuario es de otra
   * empresa que la tienda que se estaba mirando: hay que recargar la página.
   */
  async login(credenciales) {
    const res = await http.post('/auth/login', credenciales)
    useAuthStore.getState().guardarSesion(res)
    return { ...res, cambioDeTienda: res.empresa ? cambiarTienda(res.empresa.slug) : false }
  },

  async registro(datos) {
    const res = await http.post('/auth/registro', { ...datos, rol_id: 0 })
    useAuthStore.getState().guardarSesion(res)
    return res
  },

  me() {
    return http.get('/auth/me')
  },
}
