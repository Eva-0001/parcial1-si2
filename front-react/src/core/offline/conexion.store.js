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

  marcar(enLinea) {
    set((estado) => (estado.enLinea === enLinea ? estado : { enLinea }))
  },

  /** Service worker nuevo esperando a que el usuario acepte actualizar. */
  ofrecerActualizacion(trabajador) {
    set({ actualizacion: trabajador })
  },
}))

export const marcarConexion = (enLinea) => useConexionStore.getState().marcar(enLinea)

export const estaEnLinea = () => useConexionStore.getState().enLinea

/**
 * Pregunta a la API si responde. `GET /` no pasa por la cache del service worker, así que
 * mide el servidor real. Cualquier respuesta HTTP cuenta como "con conexión".
 */
export async function comprobarConexion() {
  try {
    await fetch(`${env.apiUrl}/`, { cache: 'no-store', signal: AbortSignal.timeout(ESPERA_PULSO_MS) })
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
