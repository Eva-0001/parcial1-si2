import { env } from '@/config/env'
import { useConexionStore } from './conexion.store'

const REVISAR_ACTUALIZACION_MS = 30 * 60 * 1000

let recargarAlCambiar = false

/** Registra el service worker (solo en el build de producción) y avisa cuando hay versión nueva. */
export function registrarServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`/sw.js?api=${encodeURIComponent(env.apiUrl)}`)
      .then((registro) => {
        vigilar(registro)
        setInterval(() => registro.update().catch(() => {}), REVISAR_ACTUALIZACION_MS)
      })
      .catch(() => {
        // Sin service worker la app funciona igual, solo que sin modo offline.
      })
  })

  // Solo se recarga cuando el usuario pidió actualizar, no en la primera instalación.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargarAlCambiar) window.location.reload()
  })
}

/** Activa la versión que está esperando y recarga la página. */
export function aplicarActualizacion() {
  const trabajador = useConexionStore.getState().actualizacion
  if (!trabajador) return
  recargarAlCambiar = true
  trabajador.postMessage({ tipo: 'ACTIVAR_VERSION' })
}

function vigilar(registro) {
  const ofrecer = (trabajador) => {
    // Sin controlador es la primera instalación: no hay versión vieja que reemplazar.
    if (navigator.serviceWorker.controller) useConexionStore.getState().ofrecerActualizacion(trabajador)
  }

  if (registro.waiting) ofrecer(registro.waiting)

  registro.addEventListener('updatefound', () => {
    const nuevo = registro.installing
    nuevo?.addEventListener('statechange', () => {
      if (nuevo.state === 'installed') ofrecer(nuevo)
    })
  })
}
