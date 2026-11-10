import { create } from 'zustand'
import { useAuthStore } from '../stores/auth.store'
import { toast } from '../stores/toast.store'
import { ALMACEN_RESERVAS, idb } from './idb'
import { enviarLote, esFalloDeEnvio, mensajeDeRechazo, quedoRegistrada } from './sync-lote'
import { anotarEnHistorial } from './historial'

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
  /** id_cliente de las reservas que viajan en el lote en curso. */
  enviando: [],
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
    const registro = await idb.obtener(ALMACEN_RESERVAS, idCliente)
    await idb.borrar(ALMACEN_RESERVAS, idCliente)
    if (registro) {
      await anotarEnHistorial({
        id_cliente: idCliente,
        tipo: 'reserva',
        usuario_id: registro.usuario_id,
        descripcion: `Reserva del ${describirReserva(registro.resumen)}`,
        resultado: 'descartada',
        mensaje: registro.error,
      })
    }
    await get().cargar()
  },

  async reintentar(idCliente) {
    const registro = await idb.obtener(ALMACEN_RESERVAS, idCliente)
    if (registro) await idb.guardar(ALMACEN_RESERVAS, { ...registro, estado: 'pendiente', error: null, resultado: null })
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

      if (pendientes.length === 0) return

      // Todas en un lote (POST /sync/push); el servidor responde por cada una.
      let resultados
      set({ enviando: pendientes.map((r) => r.id_cliente) })
      try {
        resultados = await enviarLote(
          pendientes.map((r) => ({
            id: r.id_cliente,
            tipo: 'reserva',
            intento: (r.intentos ?? 0) + 1,
            datos: r.payload,
          })),
        )
      } catch (e) {
        // Sin red, sesión vencida o servidor caído: siguen en espera y se reintenta más tarde.
        for (const r of pendientes) {
          await idb.guardar(
            ALMACEN_RESERVAS,
            esFalloDeEnvio(e)
              ? { ...r, intentos: (r.intentos ?? 0) + 1 }
              : { ...r, estado: 'error', error: e.message },
          )
        }
        return
      }

      for (const registro of pendientes) {
        const r = resultados.get(registro.id_cliente)
        const descripcion = `Reserva del ${describirReserva(registro.resumen)}`
        if (quedoRegistrada(r)) {
          await idb.borrar(ALMACEN_RESERVAS, registro.id_cliente)
          await anotarEnHistorial({
            id_cliente: registro.id_cliente,
            tipo: 'reserva',
            usuario_id: registro.usuario_id,
            descripcion,
            resultado: 'confirmada',
            servidor_id: r.servidor_id,
          })
          confirmadas++
          toast.exito(`¡Listo! Tu reserva del ${describirReserva(registro.resumen)} ya quedó registrada.`)
        } else if (r && r.resultado !== 'error') {
          // El servidor la rechazó (fecha pasada, sin stock...): queda para que el cliente decida.
          const motivo = mensajeDeRechazo(r)
          await idb.guardar(ALMACEN_RESERVAS, { ...registro, estado: 'error', resultado: r.resultado, error: motivo })
          await anotarEnHistorial({
            id_cliente: registro.id_cliente,
            tipo: 'reserva',
            usuario_id: registro.usuario_id,
            descripcion,
            resultado: r.resultado,
            mensaje: motivo,
          })
          toast.error(`No pudimos registrar tu reserva del ${describirReserva(registro.resumen)}: ${motivo}`)
        } else {
          await idb.guardar(ALMACEN_RESERVAS, { ...registro, intentos: (registro.intentos ?? 0) + 1 })
        }
      }
    } finally {
      await get().cargar()
      set((estado) => ({ sincronizando: false, enviando: [], confirmadas: estado.confirmadas + confirmadas }))
    }
  },
}))

/** Reservas en espera (o con error) del usuario. */
export function useReservasEnCola(usuarioId) {
  const reservas = useColaReservasStore((s) => s.reservas)
  return usuarioId ? reservas.filter((r) => r.usuario_id === usuarioId) : []
}
