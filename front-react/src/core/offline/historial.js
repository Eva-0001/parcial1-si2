import { create } from 'zustand'
import { ALMACEN_HISTORIAL, idb } from './idb'

/**
 * Historial de las operaciones hechas sin conexión una vez que tienen un
 * resultado final: confirmada, rechazada, conflicto o descartada. Las colas
 * sacan de su lista lo confirmado, pero aquí queda el registro: ninguna
 * operación desaparece sin dejar rastro.
 *
 * Registro: { id, id_cliente, tipo: 'venta' | 'reserva' | 'pedido', usuario_id,
 *             descripcion, resultado, servidor_id, mensaje, fecha }
 */
const MAXIMO = 200

export const useHistorialStore = create((set) => ({
  registros: [],

  async cargar() {
    try {
      const todos = await idb.todos(ALMACEN_HISTORIAL)
      set({ registros: todos.sort((a, b) => b.fecha.localeCompare(a.fecha)) })
    } catch {
      set({ registros: [] })
    }
  },
}))

/** Agrega el resultado final de una operación (y recorta los más viejos). */
export async function anotarEnHistorial({
  id_cliente,
  tipo,
  usuario_id,
  descripcion,
  resultado,
  servidor_id = null,
  mensaje = null,
}) {
  const fecha = new Date().toISOString()
  try {
    await idb.guardar(ALMACEN_HISTORIAL, {
      id: `${id_cliente}:${resultado}`,
      id_cliente,
      tipo,
      usuario_id,
      descripcion,
      resultado,
      servidor_id,
      mensaje,
      fecha,
    })
    const todos = await idb.todos(ALMACEN_HISTORIAL)
    if (todos.length > MAXIMO) {
      const sobrantes = todos.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, todos.length - MAXIMO)
      for (const r of sobrantes) await idb.borrar(ALMACEN_HISTORIAL, r.id)
    }
  } catch {
    // El historial es informativo: si falla, la operación igual quedó hecha.
  }
  await useHistorialStore.getState().cargar()
}
