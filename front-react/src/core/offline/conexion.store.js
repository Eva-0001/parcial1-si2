import { create } from 'zustand'
import { env } from '@/config/env'

const PULSO_MS = 15_000
const ESPERA_PULSO_MS = 5_000

/**
 * Estado de la conexión con el SERVIDOR (no solo con la red): `navigator.onLine` solo
 * sabe si el equipo tiene red, y en localhost la API responde aunque no haya internet.
 * Se marca sin conexión cuando una petición falla por red, la responde el service
 * worker desde su cache o el pulso periódico a la API no obtiene respuesta.
 */
export const useConexionStore = create((set) => ({
  enLinea: true,
  actualizacion: null,
  /**
   * Fecha más antigua de los datos guardados que se están mostrando sin conexión
   * (pueden estar desactualizados). Se limpia al volver la conexión.
   */
  datosDesde: null,

  marcar(enLinea) {
    set((estado) =>
      estado.enLinea === enLinea ? estado : { enLinea, datosDesde: enLinea ? null : estado.datosDesde },
    )
  },

  usarDatosGuardados(fecha) {
    set((estado) => ({
      datosDesde: estado.datosDesde && estado.datosDesde < fecha ? estado.datosDesde : fecha,
    }))
  },

  /** Service worker nuevo esperando a que el usuario acepte actualizar. */
  ofrecerActualizacion(trabajador) {
    set({ actualizacion: trabajador })
  },
}))

export const marcarConexion = (enLinea) => useConexionStore.getState().marcar(enLinea)

export const estaEnLinea = () => useConexionStore.getState().enLinea

/**
 * El proxy (nginx) responde 502/503/504 en HTML cuando la API está caída o reiniciándose:
 * para la app es lo mismo que no tener conexión. Los 502/503 de la propia API (pagos, IA)
 * llegan en JSON y siguen siendo errores normales.
 */
export function esCaidaDelServidor(status, tipoContenido) {
  return [502, 503, 504].includes(status) && !String(tipoContenido ?? '').includes('application/json')
}

/**
 * Pregunta a la API si responde. `GET /` no pasa por la cache del service worker, así que
 * mide el servidor real. Cualquier respuesta HTTP de la API cuenta como "con conexión".
 */
export async function comprobarConexion() {
  try {
    const r = await fetch(`${env.apiUrl}/`, { cache: 'no-store', signal: AbortSignal.timeout(ESPERA_PULSO_MS) })
    if (esCaidaDelServidor(r.status, r.headers.get('content-type'))) throw new Error('API caída')
    marcarConexion(true)
    return true
  } catch {
    marcarConexion(false)
    return false
  }
}

if (typeof window !== 'undefined') {
  // Sin red el servidor remoto no responde, pero uno local sí: se confirma con el pulso.
  window.addEventListener('offline', () => comprobarConexion())
  window.addEventListener('online', () => comprobarConexion())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') comprobarConexion()
  })
  // Pulso mientras la pestaña está a la vista: detecta la caída del servidor aunque
  // nadie esté haciendo peticiones, y su vuelta para disparar la sincronización.
  setInterval(() => {
    if (document.visibilityState === 'visible') comprobarConexion()
  }, PULSO_MS)
  comprobarConexion()
}

/** Header con el que el service worker marca las respuestas servidas desde su cache. */
export const HEADER_DESDE_CACHE = 'x-fashionstore-cache'
