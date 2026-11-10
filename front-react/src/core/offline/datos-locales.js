import { create } from 'zustand'
import { tiendaActual } from '../stores/tienda.store'
import { ALMACEN_RESPUESTAS, idb } from './idb'

/**
 * Copia local (IndexedDB) de las consultas del catálogo: productos, variantes,
 * precios, tallas, colores, stock por sucursal, sucursales y promociones. Cada
 * respuesta se guarda al llegar de la API; sin conexión, `http.js` responde con
 * la copia y avisa la fecha en que se guardó (puede estar desactualizada).
 * Funciona también en desarrollo, donde no hay service worker.
 */
export const RUTAS_DEL_CATALOGO =
  /^\/(modelos|productos|stock|sucursales|ciudades|promociones|categorias|colecciones|colores|tallas|temporadas)(\/\d+)?$/

const CLAVE_DESCARGA = 'datos_sin_conexion'

const rutaDe = (config) => (config.url ?? '').split('?')[0]

export const esDelCatalogo = (config) =>
  (config.method ?? 'get').toLowerCase() === 'get' && RUTAS_DEL_CATALOGO.test(rutaDe(config))

/** Misma tienda + misma ruta + mismos parámetros = misma copia. */
function claveDe(config) {
  const params = Object.entries(config.params ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return `${tiendaActual()}|${rutaDe(config)}${params ? `?${params}` : ''}`
}

export async function guardarRespuesta(config, datos) {
  try {
    await idb.guardar(ALMACEN_RESPUESTAS, { clave: claveDe(config), datos, guardado_en: new Date().toISOString() })
  } catch {
    // Sin espacio o IndexedDB bloqueado: la app sigue funcionando en línea.
  }
}

/** { datos, guardado_en } o null si nunca se guardó esa consulta. */
export async function respuestaGuardada(config) {
  try {
    return (await idb.obtener(ALMACEN_RESPUESTAS, claveDe(config))) ?? null
  } catch {
    return null
  }
}

/** Última descarga, reactiva: la tarjeta se actualiza aunque la descarga la haga otro componente. */
export const useDescargaStore = create(() => ({ ultima: null, version: 0 }))

/** Fecha de la última descarga completa para trabajar sin conexión (en esta tienda). */
export function ultimaDescarga() {
  try {
    return JSON.parse(localStorage.getItem(`${CLAVE_DESCARGA}:${tiendaActual()}`) ?? 'null')
  } catch {
    return null
  }
}

/**
 * Descarga y guarda todo lo que el POS, el catálogo y el inventario consultan:
 * catálogos, productos, modelos, sucursales, promociones y el stock de cada
 * sucursal. `http` es el cliente axios (se recibe para evitar un import circular).
 */
export async function descargarParaSinConexion(http, alAvanzar = () => {}) {
  const base = ['/categorias', '/colecciones', '/colores', '/tallas', '/temporadas', '/ciudades']
  const principales = ['/sucursales', '/productos', '/modelos', '/promociones', '/stock']
  const total = { hechas: 0, previstas: base.length + principales.length }

  const pedir = async (url, params) => {
    const datos = await http.get(url, params ? { params } : undefined)
    total.hechas++
    alAvanzar(total.hechas, total.previstas)
    return datos
  }

  await Promise.all(base.map((url) => pedir(url)))
  const [sucursales] = await Promise.all(principales.map((url) => pedir(url)))

  total.previstas += sucursales.length
  await Promise.all(sucursales.map((s) => pedir('/stock', { sucursal_id: s.id })))

  const resumen = {
    fecha: new Date().toISOString(),
    consultas: total.hechas,
    sucursales: sucursales.length,
  }
  try {
    localStorage.setItem(`${CLAVE_DESCARGA}:${tiendaActual()}`, JSON.stringify(resumen))
  } catch {
    // ignorado: solo es el aviso de la fecha
  }
  useDescargaStore.setState((s) => ({ ultima: resumen, version: s.version + 1 }))
  return resumen
}
