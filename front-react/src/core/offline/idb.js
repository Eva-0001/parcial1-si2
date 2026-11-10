// Envoltorio mínimo de IndexedDB con promesas. Guarda lo que tiene que sobrevivir
// sin conexión y a un cierre del navegador: las colas de ventas del POS, reservas y pedidos en línea,
// las respuestas del catálogo para consultarlo sin red y el historial de lo sincronizado.

const NOMBRE_DB = 'fashionstore-offline'
const VERSION_DB = 4
export const ALMACEN_VENTAS = 'ventas_pendientes'
export const ALMACEN_RESERVAS = 'reservas_pendientes'
export const ALMACEN_PEDIDOS = 'pedidos_pendientes'
/** Respuestas de la API del catálogo (productos, stock, sucursales…) por tienda y URL. */
export const ALMACEN_RESPUESTAS = 'respuestas'
/** Resultado final de cada operación sincronizada (confirmada, rechazada, conflicto, descartada). */
export const ALMACEN_HISTORIAL = 'historial_sync'

const CLAVES = {
  [ALMACEN_VENTAS]: 'id_cliente',
  [ALMACEN_RESERVAS]: 'id_cliente',
  [ALMACEN_PEDIDOS]: 'id_cliente',
  [ALMACEN_RESPUESTAS]: 'clave',
  [ALMACEN_HISTORIAL]: 'id',
}

let conexion = null

function abrir() {
  conexion ??= new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(NOMBRE_DB, VERSION_DB)
    pedido.onupgradeneeded = () => {
      const db = pedido.result
      for (const [almacen, keyPath] of Object.entries(CLAVES)) {
        if (!db.objectStoreNames.contains(almacen)) db.createObjectStore(almacen, { keyPath })
      }
    }
    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => {
      conexion = null
      rechazar(pedido.error)
    }
  })
  return conexion
}

function operar(almacen, modo, accion) {
  return abrir().then(
    (db) =>
      new Promise((resolver, rechazar) => {
        const tx = db.transaction(almacen, modo)
        const pedido = accion(tx.objectStore(almacen))
        tx.oncomplete = () => resolver(pedido?.result)
        tx.onerror = () => rechazar(tx.error)
        tx.onabort = () => rechazar(tx.error)
      }),
  )
}

export const idb = {
  todos: (almacen) => operar(almacen, 'readonly', (s) => s.getAll()),
  claves: (almacen) => operar(almacen, 'readonly', (s) => s.getAllKeys()),
  obtener: (almacen, clave) => operar(almacen, 'readonly', (s) => s.get(clave)),
  guardar: (almacen, valor) => operar(almacen, 'readwrite', (s) => s.put(valor)),
  borrar: (almacen, clave) => operar(almacen, 'readwrite', (s) => s.delete(clave)),
}
