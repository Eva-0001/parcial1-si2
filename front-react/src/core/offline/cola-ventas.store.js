import { useEffect } from 'react'
import { create } from 'zustand'
import { ventasService } from '@/features/ventas/services/ventas.service'
import { emitirTicket } from '@/features/pos/services/cobro.service'
import { useAuthStore } from '../stores/auth.store'
import { toast } from '../stores/toast.store'
import { ALMACEN_VENTAS, idb } from './idb'
import { useConexionStore } from './conexion.store'
import { useColaReservasStore } from './cola-reservas.store'
import { useColaPedidosStore } from './cola-pedidos.store'

const INTERVALO_REINTENTO_MS = 20_000
const CLAVE_SINCRONIZADAS = 'ventas_sincronizadas'
const MAX_RECORDADAS = 50

/**
 * Ventas del POS cobradas sin conexión. Cada una lleva un UUID (id_cliente): el backend
 * devuelve la misma venta si llega dos veces, así que reintentar nunca la duplica.
 *
 * Registro: { id_cliente, usuario_id, creada_en, estado: 'pendiente' | 'error', error,
 *             venta_id, payload (cuerpo de POST /ventas), ticket (datos para imprimir) }
 */
export const useColaVentasStore = create((set, get) => ({
  ventas: [],
  sincronizando: false,

  async cargar() {
    try {
      const ventas = await idb.todos(ALMACEN_VENTAS)
      set({ ventas: ventas.sort((a, b) => a.creada_en.localeCompare(b.creada_en)) })
    } catch {
      set({ ventas: [] })
    }
  },

  async encolar(registro) {
    await idb.guardar(ALMACEN_VENTAS, { ...registro, estado: 'pendiente', error: null, venta_id: null })
    await get().cargar()
  },

  async descartar(idCliente) {
    await idb.borrar(ALMACEN_VENTAS, idCliente)
    await get().cargar()
  },

  async reintentar(idCliente) {
    const registro = await idb.obtener(ALMACEN_VENTAS, idCliente)
    if (registro) await idb.guardar(ALMACEN_VENTAS, { ...registro, estado: 'pendiente', error: null })
    await get().cargar()
    return get().sincronizar()
  },

  /** Envía en orden las ventas pendientes del usuario actual. */
  async sincronizar() {
    if (get().sincronizando) return
    const usuario = useAuthStore.getState().usuario
    if (!usuario) return

    set({ sincronizando: true })
    let hechas = 0
    let conErrores = 0

    try {
      const pendientes = (await idb.todos(ALMACEN_VENTAS))
        .filter((r) => r.usuario_id === usuario.id && r.estado === 'pendiente')
        .sort((a, b) => a.creada_en.localeCompare(b.creada_en))

      for (const registro of pendientes) {
        try {
          let venta
          if (registro.venta_id) {
            venta = await ventasService.obtener(registro.venta_id)
          } else {
            venta = await ventasService.crear({
              ...registro.payload,
              id_cliente: registro.id_cliente,
              registrada_en: registro.creada_en,
            })
            // Si el ticket falla, el próximo intento no vuelve a crear la venta.
            await idb.guardar(ALMACEN_VENTAS, { ...registro, venta_id: venta.id })
          }

          await emitirTicket(venta)
          await idb.borrar(ALMACEN_VENTAS, registro.id_cliente)
          recordarSincronizada(registro.id_cliente, venta.id)
          hechas++
        } catch (e) {
          // Sin red, sesión vencida o servidor caído: se corta y se reintenta más tarde.
          if (e.status === 0 || e.status === 401 || e.status >= 500) break

          // Rechazo del negocio (sin stock, sin turno abierto...): queda para revisar a mano.
          await idb.guardar(ALMACEN_VENTAS, { ...registro, estado: 'error', error: e.message })
          conErrores++
        }
      }
    } finally {
      await get().cargar()
      set({ sincronizando: false })
    }

    if (hechas > 0) {
      toast.exito(
        hechas === 1
          ? 'Se sincronizó 1 venta hecha sin conexión'
          : `Se sincronizaron ${hechas} ventas hechas sin conexión`,
      )
    }
    if (conErrores > 0) {
      toast.error(`${conErrores} venta(s) sin conexión no se pudieron registrar: revísalas en Sincronización`)
    }
  },
}))

/** Ventas en cola del usuario (pendientes y con error). */
export function useVentasEnCola(usuarioId) {
  const ventas = useColaVentasStore((s) => s.ventas)
  return usuarioId ? ventas.filter((v) => v.usuario_id === usuarioId) : []
}

/** Unidades ya vendidas offline por registro de stock: todavía no se descontaron en el servidor. */
export function unidadesEnColaPorStock(ventas) {
  const mapa = new Map()
  for (const v of ventas) {
    if (v.venta_id) continue
    for (const d of v.payload.detalles) {
      mapa.set(d.producto_sucursal_id, (mapa.get(d.producto_sucursal_id) ?? 0) + d.cantidad)
    }
  }
  return mapa
}

function recordarSincronizada(idCliente, ventaId) {
  try {
    const mapa = JSON.parse(localStorage.getItem(CLAVE_SINCRONIZADAS) ?? '{}')
    mapa[idCliente] = ventaId
    const recientes = Object.entries(mapa).slice(-MAX_RECORDADAS)
    localStorage.setItem(CLAVE_SINCRONIZADAS, JSON.stringify(Object.fromEntries(recientes)))
  } catch {
    // Solo sirve para redirigir un ticket provisional a la venta real.
  }
}

export function ventaSincronizada(idCliente) {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SINCRONIZADAS) ?? '{}')[idCliente] ?? null
  } catch {
    return null
  }
}

// Colas offline que se sincronizan solas: ventas del POS, reservas y pedidos en línea de clientes.
const COLAS = [
  { store: () => useColaVentasStore.getState(), items: (e) => e.ventas },
  { store: () => useColaReservasStore.getState(), items: (e) => e.reservas },
  { store: () => useColaPedidosStore.getState(), items: (e) => e.pedidos },
]

/** Carga las colas y las sincroniza al volver la conexión, al iniciar sesión y cada cierto tiempo. */
export function useSincronizacionAutomatica() {
  const usuarioId = useAuthStore((s) => s.usuario?.id ?? null)
  const enLinea = useConexionStore((s) => s.enLinea)

  useEffect(() => {
    for (const cola of COLAS) {
      const estado = cola.store()
      estado.cargar().then(() => {
        if (usuarioId && useConexionStore.getState().enLinea) estado.sincronizar()
      })
    }
  }, [usuarioId])

  useEffect(() => {
    if (!enLinea || !usuarioId) return
    for (const cola of COLAS) cola.store().sincronizar()
  }, [enLinea, usuarioId])

  useEffect(() => {
    if (!usuarioId) return
    const intervalo = setInterval(() => {
      if (!useConexionStore.getState().enLinea) return
      for (const cola of COLAS) {
        const estado = cola.store()
        const hayPendientes = cola.items(estado).some((r) => r.usuario_id === usuarioId && r.estado === 'pendiente')
        if (hayPendientes) estado.sincronizar()
      }
    }, INTERVALO_REINTENTO_MS)
    return () => clearInterval(intervalo)
  }, [usuarioId])
}
