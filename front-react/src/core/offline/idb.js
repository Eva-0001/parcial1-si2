// Envoltorio mínimo de IndexedDB con promesas. Guarda lo que tiene que sobrevivir
// sin conexión y a un cierre del navegador: las colas de ventas del POS, reservas y pedidos en línea.

const NOMBRE_DB = 'fashionstore-offline'
const VERSION_DB = 3
export const ALMACEN_VENTAS = 'ventas_pendientes'
export const ALMACEN_RESERVAS = 'reservas_pendientes'
export const ALMACEN_PEDIDOS = 'pedidos_pendientes'

let conexion = null

function abrir() {
  conexion ??= new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(NOMBRE_DB, VERSION_DB)
    pedido.onupgradeneeded = () => {
      const db = pedido.result
      for (const almacen of [ALMACEN_VENTAS, ALMACEN_RESERVAS, ALMACEN_PEDIDOS]) {
        if (!db.objectStoreNames.contains(almacen)) db.createObjectStore(almacen, { keyPath: 'id_cliente' })
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
  obtener: (almacen, clave) => operar(almacen, 'readonly', (s) => s.get(clave)),
  guardar: (almacen, valor) => operar(almacen, 'readwrite', (s) => s.put(valor)),
  borrar: (almacen, clave) => operar(almacen, 'readwrite', (s) => s.delete(clave)),
}
