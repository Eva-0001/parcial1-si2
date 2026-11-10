import { create } from 'zustand'
import { ventasService } from '@/features/ventas/services/ventas.service'
import { numeroVenta } from '@/features/ventas/ventas.utils'
import { useAuthStore } from '../stores/auth.store'
import { toast } from '../stores/toast.store'
import { anotarEnHistorial } from './historial'

const describirPedido = (r) => `Pedido en línea${r.resumen?.sucursal ? ` de ${r.resumen.sucursal}` : ''}`
import { ALMACEN_PEDIDOS, idb } from './idb'

/**
 * Pedidos en línea hechos sin conexión, pagados por QR (con la foto del comprobante) o
 * contraentrega. Llevan un UUID (id_cliente): el backend devuelve el mismo pedido si llega
 * dos veces, así que reintentar nunca lo duplica.
 *
 * Registro: { id_cliente, usuario_id, creada_en, estado: 'pendiente' | 'error', error,
 *             venta_id (ya creado en el servidor, falta el comprobante), payload (cuerpo de POST /ventas),
 *             comprobante (Blob del comprobante QR o null), resumen (para mostrarlo mientras espera) }
 */
export const useColaPedidosStore = create((set, get) => ({
  pedidos: [],
  sincronizando: false,
  /** Se incrementa cada vez que un pedido llega al servidor (para refrescar listas). */
  confirmados: 0,

  async cargar() {
    try {
      const pedidos = await idb.todos(ALMACEN_PEDIDOS)
      set({ pedidos: pedidos.sort((a, b) => a.creada_en.localeCompare(b.creada_en)) })
    } catch {
      set({ pedidos: [] })
    }
  },

  async encolar(registro) {
    await idb.guardar(ALMACEN_PEDIDOS, { ...registro, estado: 'pendiente', error: null, venta_id: null })
    await get().cargar()
  },

  async descartar(idCliente) {
    const registro = await idb.obtener(ALMACEN_PEDIDOS, idCliente)
    await idb.borrar(ALMACEN_PEDIDOS, idCliente)
    if (registro) {
      await anotarEnHistorial({
        id_cliente: idCliente,
        tipo: 'pedido',
        usuario_id: registro.usuario_id,
        descripcion: describirPedido(registro),
        resultado: 'descartada',
        mensaje: registro.error,
      })
    }
    await get().cargar()
  },

  async reintentar(idCliente) {
    const registro = await idb.obtener(ALMACEN_PEDIDOS, idCliente)
    if (registro) await idb.guardar(ALMACEN_PEDIDOS, { ...registro, estado: 'pendiente', error: null, resultado: null })
    await get().cargar()
    return get().sincronizar()
  },

  /** Envía en orden los pedidos en espera del usuario actual y avisa el resultado de cada uno. */
  async sincronizar() {
    if (get().sincronizando) return
    const usuario = useAuthStore.getState().usuario
    if (!usuario) return

    set({ sincronizando: true })
    let confirmados = 0

    try {
      const pendientes = (await idb.todos(ALMACEN_PEDIDOS))
        .filter((r) => r.usuario_id === usuario.id && r.estado === 'pendiente')
        .sort((a, b) => a.creada_en.localeCompare(b.creada_en))

      for (const registro of pendientes) {
        let ventaId = registro.venta_id
        try {
          if (!ventaId) {
            const venta = await ventasService.crear({ ...registro.payload, id_cliente: registro.id_cliente })
            ventaId = venta.id
            // Si el comprobante falla, el próximo intento no vuelve a crear el pedido.
            await idb.guardar(ALMACEN_PEDIDOS, { ...registro, venta_id: ventaId })
          }

          if (registro.comprobante) {
            try {
              await ventasService.subirComprobantePago(ventaId, registro.comprobante)
            } catch (e) {
              if (e.status === 0 || e.status === 401 || e.status >= 500) throw e
              // El pedido ya existe: el cliente puede subir otro comprobante desde el detalle.
              toast.advertencia(
                `Tu pedido ${numeroVenta(ventaId)} quedó registrado, pero el comprobante no se subió (${e.message}). Súbelo desde "Mis pedidos".`,
              )
            }
          }

          await idb.borrar(ALMACEN_PEDIDOS, registro.id_cliente)
          await anotarEnHistorial({
            id_cliente: registro.id_cliente,
            tipo: 'pedido',
            usuario_id: registro.usuario_id,
            descripcion: describirPedido(registro),
            resultado: 'confirmada',
            servidor_id: ventaId,
          })
          confirmados++
          const metodo = registro.payload.metodo_pago
          toast.exito(
            metodo === 'qr'
              ? `¡Listo! Tu pedido ${numeroVenta(ventaId)} ya llegó a la tienda. Un encargado revisará tu comprobante.`
              : metodo === 'efectivo'
                ? `¡Listo! La venta al contado ${numeroVenta(ventaId)} ya quedó registrada.`
                : `¡Listo! Tu pedido ${numeroVenta(ventaId)} ya quedó registrado. Pagas al ${registro.resumen.modalidad === 'domicilio' ? 'recibirlo' : 'retirarlo'}.`,
          )
        } catch (e) {
          // Sin red, sesión vencida o servidor caído: sigue en espera y se reintenta más tarde.
          if (e.status === 0 || e.status === 401 || e.status >= 500) break

          // El servidor lo rechazó (sin stock, límite de pagos pendientes...): queda para que el cliente decida.
          const resultado = e.codigo === 'SIN_STOCK' || e.codigo === 'STOCK_INEXISTENTE' ? 'conflicto' : 'rechazada'
          await idb.guardar(ALMACEN_PEDIDOS, {
            ...registro,
            venta_id: ventaId,
            estado: 'error',
            resultado,
            error: e.message,
          })
          await anotarEnHistorial({
            id_cliente: registro.id_cliente,
            tipo: 'pedido',
            usuario_id: registro.usuario_id,
            descripcion: describirPedido(registro),
            resultado,
            mensaje: e.message,
          })
          toast.error(`No pudimos registrar tu pedido de ${registro.resumen.sucursal ?? 'la tienda'}: ${e.message}`)
        }
      }
    } finally {
      await get().cargar()
      set((estado) => ({ sincronizando: false, confirmados: estado.confirmados + confirmados }))
    }
  },
}))

/** Pedidos en espera (o con error) del usuario. */
export function usePedidosEnCola(usuarioId) {
  const pedidos = useColaPedidosStore((s) => s.pedidos)
  return usuarioId ? pedidos.filter((r) => r.usuario_id === usuarioId) : []
}
