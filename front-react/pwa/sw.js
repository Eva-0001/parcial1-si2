/* Service worker de FashionStore (PWA offline).
 *
 * Plantilla: al compilar, el plugin `pwa` de vite.config.js reemplaza los marcadores
 * de VERSION y PRECACHE por el hash del build y la lista de archivos generados.
 *
 * Estrategias:
 * - App shell (index.html, JS, CSS, iconos): precache en la instalacion.
 * - Navegacion: red primero y, sin conexion, el index.html guardado (la SPA resuelve la ruta).
 * - API publica de lectura (catalogo, stock, sucursales...): red primero con tiempo limite
 *   y, sin conexion, la ultima respuesta guardada. Nada privado se guarda en cache.
 * - Imagenes subidas y fuentes: cache primero / revalidar en segundo plano.
 */

const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__

const CACHE_SHELL = `fs-shell-${VERSION}`
const CACHE_API = 'fs-api-v1'
const CACHE_MEDIA = 'fs-media-v1'
const CACHE_FUENTES = 'fs-fuentes-v1'
const CACHES_VIGENTES = [CACHE_SHELL, CACHE_API, CACHE_MEDIA, CACHE_FUENTES]

const MAX_IMAGENES = 300

// Los servidores suelen responder con Vary: Origin / Accept-Encoding. Un import() de
// modulo manda Origin y el precache no: sin ignoreVary la pagina lazy no se encuentra
// offline. Es seguro porque el shell tiene nombres con hash y la API cacheada es publica.
const COINCIDIR = { ignoreVary: true }
const ESPERA_RED_MS = 4000

// La URL base de la API llega como parametro al registrar el SW (VITE_API_URL).
const API_BASE = (() => {
  const pedida = new URL(self.location.href).searchParams.get('api') || '/api'
  return new URL(pedida, self.location.origin).href.replace(/\/+$/, '')
})()

// Solo lecturas publicas: las mismas para cualquier usuario, sin datos personales.
const API_CACHEABLE =
  /^\/(modelos|productos|stock|sucursales|ciudades|promociones|categorias|colecciones|colores|tallas|temporadas)(\/|\?|$)|^\/pagos\/config(\?|$)/
const API_MEDIA = /^\/uploads\//

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_SHELL).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(nombres.filter((n) => n.startsWith('fs-') && !CACHES_VIGENTES.includes(n)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  )
})

// La app pide activar la version nueva cuando el usuario acepta actualizar.
self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'ACTIVAR_VERSION') self.skipWaiting()
})

self.addEventListener('fetch', (evento) => {
  const { request } = evento
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    evento.respondWith(navegacion(request))
    return
  }

  if (url.href.startsWith(API_BASE + '/')) {
    const ruta = url.href.slice(API_BASE.length)
    if (API_MEDIA.test(ruta)) {
      evento.respondWith(cachePrimero(request, CACHE_MEDIA, MAX_IMAGENES))
    } else if (API_CACHEABLE.test(ruta)) {
      evento.respondWith(redPrimero(request, CACHE_API))
    }
    return
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    evento.respondWith(revalidarEnFondo(request, CACHE_FUENTES))
    return
  }

  if (url.origin === self.location.origin) {
    evento.respondWith(cachePrimero(request, CACHE_SHELL))
  }
})

async function navegacion(request) {
  try {
    return await conTiempoLimite(fetch(request), ESPERA_RED_MS)
  } catch {
    const shell = await caches.open(CACHE_SHELL)
    return (await shell.match('/index.html', COINCIDIR)) || Response.error()
  }
}

async function redPrimero(request, nombreCache) {
  const cache = await caches.open(nombreCache)
  try {
    const respuesta = await conTiempoLimite(fetch(request), ESPERA_RED_MS)
    if (respuesta.ok) cache.put(request, respuesta.clone())
    return respuesta
  } catch {
    // Se ignora el header Authorization: son lecturas publicas.
    const guardada = await cache.match(request, COINCIDIR)
    if (!guardada) return Response.error()

    // La app lee este header para saber que esta viendo datos guardados.
    const headers = new Headers(guardada.headers)
    headers.set('x-fashionstore-cache', '1')
    return new Response(guardada.body, { status: guardada.status, statusText: guardada.statusText, headers })
  }
}

async function cachePrimero(request, nombreCache, maximo = 0) {
  const cache = await caches.open(nombreCache)
  const guardada = await cache.match(request, COINCIDIR)
  if (guardada) return guardada

  const respuesta = await fetch(request)
  if (respuesta.ok || respuesta.type === 'opaque') {
    await cache.put(request, respuesta.clone())
    if (maximo > 0) recortar(cache, maximo)
  }
  return respuesta
}

async function revalidarEnFondo(request, nombreCache) {
  const cache = await caches.open(nombreCache)
  const guardada = await cache.match(request, COINCIDIR)
  const deRed = fetch(request)
    .then((respuesta) => {
      if (respuesta.ok || respuesta.type === 'opaque') cache.put(request, respuesta.clone())
      return respuesta
    })
    .catch(() => guardada || Response.error())
  return guardada || deRed
}

async function recortar(cache, maximo) {
  const claves = await cache.keys()
  for (const clave of claves.slice(0, Math.max(0, claves.length - maximo))) {
    await cache.delete(clave)
  }
}

function conTiempoLimite(promesa, ms) {
  return new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(() => rechazar(new Error('tiempo agotado')), ms)
    promesa.then(
      (valor) => {
        clearTimeout(temporizador)
        resolver(valor)
      },
      (error) => {
        clearTimeout(temporizador)
        rechazar(error)
      },
    )
  })
}
