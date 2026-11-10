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
import { enviarLote, esFalloDeEnvio, mensajeDeRechazo, quedoRegistrada } from './sync-lote'
import { anotarEnHistorial } from './historial'
import { monedaBs } from '@/shared/utils/moneda-bs'

const describirVenta = (r) =>
  `Venta de ${monedaBs(r.ticket?.total ?? 0)}${r.ticket?.sucursal?.nombre ? ` en ${r.ticket.sucursal.nombre}` : ''}`

const INTERVALO_REINTENTO_MS = 20_000
const CLAVE_SINCRONIZADAS = 'ventas_sincronizadas'
const MAX_RECORDADAS = 50

/**
 * Ventas del POS cobradas sin conexión. Cada una lleva un UUID (id_cliente): el backend
 * devuelve la misma venta si llega dos veces, así que reintentar nunca la duplica.
 *
 * Registro: { id_cliente, usuario_id, creada_en, estado: 'pendiente' | 'error', error,
 *             resultado: 'rechazada' | 'conflicto' (si estado = 'error'), intentos,
 *             venta_id, payload (cuerpo de POST /ventas), ticket (datos para imprimir) }
 *
 * Estados que ve el usuario: local (sin intentos), enviando (en el lote en curso),
 * reintentando (falló el envío), rechazada / conflicto, y confirmada (en el historial).
 */
export const useColaVentasStore = create((set, get) => ({
  ventas: [],
  sincronizando: false,
  /** id_cliente de las ventas que viajan en el lote en curso. */
  enviando: [],

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
    const registro = await idb.obtener(ALMACEN_VENTAS, idCliente)
    await idb.borrar(ALMACEN_VENTAS, idCliente)
    if (registro) {
      await anotarEnHistorial({
        id_cliente: idCliente,
        tipo: 'venta',
        usuario_id: registro.usuario_id,
        descripcion: describirVenta(registro),
        resultado: 'descartada',
        mensaje: registro.error,
      })
    }
    await get().cargar()
  },

  /**
   * Conflicto de precio: reenvía la venta pidiendo respetar lo cobrado. Si quien opera no
   * es administrador ni encargado, un supervisor escribe su usuario y contraseña; esos
   * datos viajan solo en este envío y no se guardan en el equipo.
   */
  async autorizarPrecios(idCliente, autorizacion = null) {
    const registro = await idb.obtener(ALMACEN_VENTAS, idCliente)
    if (!registro) return null
    await idb.guardar(ALMACEN_VENTAS, { ...registro, estado: 'pendiente', error: null })
    await get().cargar()
    await get().sincronizar({ [idCliente]: { respetar_precios: true, ...(autorizacion ? { autorizacion } : {}) } })
    return idb.obtener(ALMACEN_VENTAS, idCliente)
  },

  async reintentar(idCliente) {
    const registro = await idb.obtener(ALMACEN_VENTAS, idCliente)
    if (registro) await idb.guardar(ALMACEN_VENTAS, { ...registro, estado: 'pendiente', error: null, resultado: null })
    await get().cargar()
    return get().sincronizar()
  },

  /**
   * Envía las ventas pendientes del usuario actual en un solo lote (POST /sync/push)
   * y después emite el ticket de cada una que quedó registrada.
   */
  async sincronizar(extras = {}) {
    if (get().sincronizando) return
    const usuario = useAuthStore.getState().usuario
    if (!usuario) return

    set({ sincronizando: true })
    let hechas = 0
    let conErrores = 0

    try {
      const deUsuario = async () =>
        (await idb.todos(ALMACEN_VENTAS))
          .filter((r) => r.usuario_id === usuario.id && r.estado === 'pendiente')
          .sort((a, b) => a.creada_en.localeCompare(b.creada_en))

      // 1. Registrar en el servidor, en un lote, las que todavía no tienen venta.
      const sinRegistrar = (await deUsuario()).filter((r) => !r.venta_id)
      if (sinRegistrar.length > 0) {
        let resultados
        set({ enviando: sinRegistrar.map((r) => r.id_cliente) })
        try {
          resultados = await enviarLote(
            sinRegistrar.map((r) => ({
              id: r.id_cliente,
              tipo: 'venta',
              sucursal_id: r.ticket?.sucursal?.id ?? undefined,
              intento: (r.intentos ?? 0) + 1,
              datos: { ...r.payload, registrada_en: r.creada_en, ...(extras[r.id_cliente] ?? {}) },
            })),
          )
        } catch (e) {
          // Sin red, sesión vencida o servidor caído: se reintenta más tarde.
          for (const r of sinRegistrar) {
            await idb.guardar(
              ALMACEN_VENTAS,
              esFalloDeEnvio(e)
                ? { ...r, intentos: (r.intentos ?? 0) + 1 }
                : { ...r, estado: 'error', error: e.message },
            )
          }
          if (!esFalloDeEnvio(e)) conErrores += sinRegistrar.length
          return
        }

        for (const registro of sinRegistrar) {
          const r = resultados.get(registro.id_cliente)
          if (quedoRegistrada(r)) {
            // Si el ticket falla, el próximo intento no vuelve a crear la venta.
            await idb.guardar(ALMACEN_VENTAS, { ...registro, venta_id: r.servidor_id })
          } else if (r && r.resultado !== 'error') {
            // Rechazo del negocio o conflicto de stock: queda para revisar a mano.
            // El stock que tenía apartado en la vista se libera solo (ver unidadesEnColaPorStock).
            const motivo = mensajeDeRechazo(r)
            // Si falló la autorización del precio, sigue siendo un conflicto de precio.
            const autorizacionFallida = extras[registro.id_cliente] && registro.codigo === 'PRECIO_CAMBIADO'
            await idb.guardar(ALMACEN_VENTAS, {
              ...registro,
              estado: 'error',
              resultado: autorizacionFallida ? 'conflicto' : r.resultado,
              codigo: autorizacionFallida ? registro.codigo : (r.codigo ?? null),
              precios: autorizacionFallida ? registro.precios : (r.precios ?? null),
              error: motivo,
            })
            await anotarEnHistorial({
              id_cliente: registro.id_cliente,
              tipo: 'venta',
              usuario_id: registro.usuario_id,
              descripcion: describirVenta(registro),
              resultado: r.resultado,
              mensaje: motivo,
            })
            conErrores++
          } else {
            await idb.guardar(ALMACEN_VENTAS, { ...registro, intentos: (registro.intentos ?? 0) + 1 })
          }
        }
      }

      // 2. Emitir el ticket de las ya registradas.
      for (const registro of (await deUsuario()).filter((r) => r.venta_id)) {
        try {
          const venta = await ventasService.obtener(registro.venta_id)
          await emitirTicket(venta)
          await idb.borrar(ALMACEN_VENTAS, registro.id_cliente)
          await anotarEnHistorial({
            id_cliente: registro.id_cliente,
            tipo: 'venta',
            usuario_id: registro.usuario_id,
            descripcion: describirVenta(registro),
            resultado: 'confirmada',
            servidor_id: venta.id,
          })
          recordarSincronizada(registro.id_cliente, venta.id)
          hechas++
        } catch (e) {
          // La venta ya está registrada; solo falta el ticket: se reintenta más tarde.
          if (esFalloDeEnvio(e)) break
          await idb.guardar(ALMACEN_VENTAS, { ...registro, estado: 'error', error: e.message })
          conErrores++
        }
      }
    } finally {
      await get().cargar()
      set({ sincronizando: false, enviando: [] })
    }

    if (hechas > 0) {
      toast.exito(
        hechas === 1
          ? 'Se sincronizó 1 venta hecha sin conexión'
          : `Se sincronizaron ${hechas} ventas hechas sin conexión`,
      )
    }
    if (conErrores > 0) {
      toast.error(
        `${conErrores} venta(s) sin conexión no se pudieron registrar: revísalas en Sincronización. ` +
          'Su stock apartado se liberó.',
      )
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
    // Ya registrada (el servidor la descontó) o rechazada (rollback: deja de apartar stock).
    if (v.venta_id || v.estado === 'error') continue
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
