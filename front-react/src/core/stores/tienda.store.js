import { env } from '@/config/env'

/**
 * Tienda (empresa / tenant) que se está mirando. Viaja al backend en la
 * cabecera X-Empresa para que el catálogo público, el registro de clientes y
 * las reservas sean de esa empresa. Con sesión iniciada manda el token.
 *
 * Se elige con `?tienda=<slug>` en la URL y queda guardada en el navegador.
 */
const TIENDA_KEY = 'tienda'

/** Datos locales que pertenecen a una tienda y no deben pasar a otra. */
const CLAVES_DE_LA_TIENDA = ['carrito', 'reserva_borrador', 'sucursal_activa']
const CACHE_API_SW = 'fs-api-v1'

function leerInicial() {
  try {
    const deUrl = new URLSearchParams(window.location.search).get('tienda')?.trim().toLowerCase()
    if (deUrl) {
      const previa = localStorage.getItem(TIENDA_KEY)
      if (previa && previa !== deUrl) limpiarDatosDeTienda()
      localStorage.setItem(TIENDA_KEY, deUrl)
      return deUrl
    }
    return localStorage.getItem(TIENDA_KEY) || env.empresaPorDefecto
  } catch {
    return env.empresaPorDefecto
  }
}

let actual = leerInicial()

export function tiendaActual() {
  return actual
}

function limpiarDatosDeTienda() {
  for (const clave of CLAVES_DE_LA_TIENDA) localStorage.removeItem(clave)
  // Las respuestas de la API que guardó el service worker son de la otra tienda.
  if (typeof caches !== 'undefined') caches.delete(CACHE_API_SW).catch(() => {})
}

/**
 * Cambia de tienda. Devuelve true si cambió: en ese caso hay que recargar la
 * página para que los datos en memoria (carrito, catálogos) no se mezclen.
 */
export function cambiarTienda(slug) {
  const nueva = slug?.trim().toLowerCase()
  if (!nueva || nueva === actual) return false
  limpiarDatosDeTienda()
  localStorage.setItem(TIENDA_KEY, nueva)
  actual = nueva
  return true
}
