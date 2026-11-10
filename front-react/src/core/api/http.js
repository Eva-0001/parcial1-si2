import axios from 'axios'
import { env } from '@/config/env'
import { ApiError } from './ApiError'
import { obtenerToken, useAuthStore } from '../stores/auth.store'
import { tiendaActual } from '../stores/tienda.store'
import { HEADER_DESDE_CACHE, esCaidaDelServidor, marcarConexion, useConexionStore } from '../offline/conexion.store'
import { esDelCatalogo, guardarRespuesta, respuestaGuardada } from '../offline/datos-locales'

export const http = axios.create({ baseURL: env.apiUrl })

http.interceptors.request.use((config) => {
  const token = obtenerToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  // Tienda que se está mirando. El login no la manda: cualquier usuario entra
  // y después la app pasa a la tienda de su empresa.
  if (!(config.url ?? '').includes('/auth/login')) config.headers['X-Empresa'] = tiendaActual()
  return config
})

http.interceptors.response.use(
  (res) => {
    const desdeCache = Boolean(res.headers?.[HEADER_DESDE_CACHE])
    marcarConexion(!desdeCache)
    // Copia en IndexedDB de lo que llega fresco del catálogo, para consultarlo sin red.
    if (!desdeCache && esDelCatalogo(res.config)) guardarRespuesta(res.config, res.data)
    return res.data
  },
  async (error) => {
    // Un 502/503/504 del proxy (API caída) se trata como sin conexión: así la venta se
    // encola y el catálogo sale de la copia guardada, igual que sin red.
    const res = error.response
    const status = !res || esCaidaDelServidor(res.status, res.headers?.['content-type']) ? 0 : res.status
    if (status === 0) marcarConexion(false)
    else marcarConexion(true)

    // Sin conexión: el catálogo se responde con la copia guardada (y se avisa su fecha).
    if (status === 0 && error.config && esDelCatalogo(error.config)) {
      const copia = await respuestaGuardada(error.config)
      if (copia) {
        useConexionStore.getState().usarDatosGuardados(copia.guardado_en)
        return copia.datos
      }
    }

    const esLogin = (error.config?.url ?? '').includes('/auth/login')
    if (status === 401 && !esLogin) {
      useAuthStore.getState().expirarSesion()
    }
    return Promise.reject(
      new ApiError(status, extraerMensaje(status, error.response?.data), error.response?.data?.codigo),
    )
  },
)

function extraerMensaje(status, cuerpo) {
  if (status === 0) return 'No pudimos conectarnos al servidor'

  const detail = cuerpo?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => d?.msg)
      .filter(Boolean)
      .join('. ')
  }

  return 'Ocurrió un error inesperado'
}

export function limpiarParams(filtros = {}) {
  const params = {}
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params[clave] = valor
  }
  return params
}
