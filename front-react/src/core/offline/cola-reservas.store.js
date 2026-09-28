import { create } from 'zustand'
import { reservasService } from '@/features/reservas/services/reservas.service'
import { useAuthStore } from '../stores/auth.store'
import { toast } from '../stores/toast.store'
import { ALMACEN_RESERVAS, idb } from './idb'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "viernes 3 de octubre a las 10:30 en FashionStore Equipetrol" */
export function describirReserva(resumen) {
  const [a, m, d] = resumen.fecha.split('-').map(Number)
  const dia = new Date(a, m - 1, d)
  const cuando = `${DIAS[dia.getDay()]} ${d} de ${MESES[m - 1]} a las ${resumen.hora}`
  return resumen.sucursal ? `${cuando} en ${resumen.sucursal}` : cuando
}

/**
 * Reservas hechas sin conexión. Llevan un UUID (id_cliente): el backend devuelve la
 * misma reserva si llega dos veces, así que reintentar nunca la duplica.
 *
 * Registro: { id_cliente, usuario_id, creada_en, estado: 'pendiente' | 'error', error,
 *             payload (cuerpo de POST /reservas), resumen (para mostrarla mientras espera) }
 */
export const useColaReservasStore = create((set, get) => ({
  reservas: [],
  sincronizando: false,
  /** Se incrementa cada vez que una reserva llega al servidor (para refrescar listas). */
  confirmadas: 0,

  async cargar() {
    try {
      const reservas = await idb.todos(ALMACEN_RESERVAS)
      set({ reservas: reservas.sort((a, b) => a.creada_en.localeCompare(b.creada_en)) })
    } catch {
      set({ reservas: [] })
    }
  },

  async encolar(registro) {
    await idb.guardar(ALMACEN_RESERVAS, { ...registro, estado: 'pendiente', error: null })
    await get().cargar()
  },

  async descartar(idCliente) {
    await idb.borrar(ALMACEN_RESERVAS, idCliente)
    await get().cargar()
  },

  async reintentar(idCliente) {
    const registro = await idb.obtener(ALMACEN_RESERVAS, idCliente)
    if (registro) await idb.guardar(ALMACEN_RESERVAS, { ...registro, estado: 'pendiente', error: null })
    await get().cargar()
    return get().sincronizar()
  },

  /** Envía en orden las reservas en espera del usuario actual y avisa el resultado de cada una. */
  async sincronizar() {
    if (get().sincronizando) return
    const usuario = useAuthStore.getState().usuario
    if (!usuario) return

    set({ sincronizando: true })
    let confirmadas = 0

    try {
      const pendientes = (await idb.todos(ALMACEN_RESERVAS))
        .filter((r) => r.usuario_id === usuario.id && r.estado === 'pendiente')
        .sort((a, b) => a.creada_en.localeCompare(b.creada_en))

      for (const registro of pendientes) {
        try {
          await reservasService.crear({ ...registro.payload, id_cliente: registro.id_cliente })
          await idb.borrar(ALMACEN_RESERVAS, registro.id_cliente)
          confirmadas++
          toast.exito(`¡Listo! Tu reserva del ${describirReserva(registro.resumen)} ya quedó registrada.`)
        } catch (e) {
          // Sin red, sesión vencida o servidor caído: sigue en espera y se reintenta más tarde.
          if (e.status === 0 || e.status === 401 || e.status >= 500) break

          // El servidor la rechazó (fecha pasada, sin stock...): queda para que el cliente decida.
          await idb.guardar(ALMACEN_RESERVAS, { ...registro, estado: 'error', error: e.message })
          toast.error(`No pudimos registrar tu reserva del ${describirReserva(registro.resumen)}: ${e.message}`)
        }
      }
    } finally {
      await get().cargar()
      set((estado) => ({ sincronizando: false, confirmadas: estado.confirmadas + confirmadas }))
    }
  },
}))

/** Reservas en espera (o con error) del usuario. */
export function useReservasEnCola(usuarioId) {
  const reservas = useColaReservasStore((s) => s.reservas)
  return usuarioId ? reservas.filter((r) => r.usuario_id === usuarioId) : []
}
