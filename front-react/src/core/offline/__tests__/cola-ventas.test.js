import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

// Sin pulso real al servidor durante las pruebas.
vi.mock('../conexion.store', () => ({
  useConexionStore: create(() => ({ enLinea: true, datosDesde: null, usarDatosGuardados: vi.fn() })),
  marcarConexion: vi.fn(),
  estaEnLinea: () => true,
  HEADER_DESDE_CACHE: 'x-fashionstore-cache',
}))
vi.mock('../sync-lote', async (original) => ({ ...(await original()), enviarLote: vi.fn() }))
vi.mock('@/features/ventas/services/ventas.service', () => ({
  ventasService: { obtener: vi.fn(async (id) => ({ id })) },
}))
vi.mock('@/features/pos/services/cobro.service', () => ({ emitirTicket: vi.fn(async () => {}) }))

const { useColaVentasStore, unidadesEnColaPorStock } = await import('../cola-ventas.store')
const { enviarLote } = await import('../sync-lote')
const { emitirTicket } = await import('@/features/pos/services/cobro.service')
const { useHistorialStore } = await import('../historial')
const { useAuthStore } = await import('../../stores/auth.store')
const { ApiError } = await import('../../api/ApiError')
const { ALMACEN_HISTORIAL, ALMACEN_VENTAS, idb } = await import('../idb')

const USUARIO = { id: 7, nombre: 'Lucia', rol: { nombre: 'cajero' } }

function venta(id, stockId = 10, cantidad = 2) {
  return {
    id_cliente: id,
    usuario_id: USUARIO.id,
    creada_en: new Date().toISOString(),
    payload: { tipo_venta: 'presencial', usuario_id: 1, metodo_pago: 'efectivo', detalles: [{ producto_sucursal_id: stockId, cantidad }] },
    ticket: { sucursal: { id: 1, nombre: 'Centro' }, total: '100.00', items: [] },
  }
}

async function vaciar() {
  for (const almacen of [ALMACEN_VENTAS, ALMACEN_HISTORIAL]) {
    const clave = almacen === ALMACEN_HISTORIAL ? 'id' : 'id_cliente'
    for (const r of await idb.todos(almacen)) await idb.borrar(almacen, r[clave])
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  useAuthStore.setState({ usuario: USUARIO })
  await vaciar()
  await useColaVentasStore.getState().cargar()
})

describe('Cola de ventas sin conexión', () => {
  it('se guarda en IndexedDB y sobrevive a "cerrar" la app (otra lectura de la base)', async () => {
    await useColaVentasStore.getState().encolar(venta('a'))
    const guardadas = await idb.todos(ALMACEN_VENTAS)
    expect(guardadas).toHaveLength(1)
    expect(guardadas[0]).toMatchObject({ id_cliente: 'a', estado: 'pendiente', venta_id: null })
  })

  it('si el lote no llega (sin red) la venta NO se borra y suma un intento', async () => {
    enviarLote.mockRejectedValueOnce(new ApiError(0, 'No pudimos conectarnos al servidor'))
    await useColaVentasStore.getState().encolar(venta('b'))
    await useColaVentasStore.getState().sincronizar()

    const [registro] = await idb.todos(ALMACEN_VENTAS)
    expect(registro).toMatchObject({ id_cliente: 'b', estado: 'pendiente', intentos: 1 })
    expect(emitirTicket).not.toHaveBeenCalled()
  })

  it('confirmada: emite el ticket, sale de la cola y queda en el historial', async () => {
    enviarLote.mockResolvedValueOnce(new Map([['c', { id: 'c', resultado: 'confirmada', servidor_id: 77 }]]))
    await useColaVentasStore.getState().encolar(venta('c'))
    await useColaVentasStore.getState().sincronizar()

    expect(enviarLote).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'c', tipo: 'venta', sucursal_id: 1, intento: 1 }),
    ])
    expect(emitirTicket).toHaveBeenCalledWith({ id: 77 })
    expect(await idb.todos(ALMACEN_VENTAS)).toHaveLength(0)
    await useHistorialStore.getState().cargar()
    expect(useHistorialStore.getState().registros[0]).toMatchObject({ id_cliente: 'c', resultado: 'confirmada', servidor_id: 77 })
  })

  it('reenvío de una venta ya registrada (duplicada) también cuenta como hecha', async () => {
    enviarLote.mockResolvedValueOnce(new Map([['d', { id: 'd', resultado: 'duplicada', servidor_id: 5 }]]))
    await useColaVentasStore.getState().encolar(venta('d'))
    await useColaVentasStore.getState().sincronizar()
    expect(await idb.todos(ALMACEN_VENTAS)).toHaveLength(0)
  })

  it('conflicto de stock: queda con el detalle, libera el stock apartado y va al historial', async () => {
    enviarLote.mockResolvedValueOnce(
      new Map([
        ['e', { id: 'e', resultado: 'conflicto', mensaje: 'Stock insuficiente', conflicto: [{ producto_sucursal_id: 10, producto: 'Polera', pedido: 2, disponible: 1 }] }],
      ]),
    )
    await useColaVentasStore.getState().encolar(venta('e', 10, 2))
    await useColaVentasStore.getState().encolar(venta('f', 10, 1))
    // Antes de sincronizar, las dos apartan stock en la vista del POS.
    expect(unidadesEnColaPorStock(await idb.todos(ALMACEN_VENTAS)).get(10)).toBe(3)

    enviarLote.mockResolvedValueOnce(new Map())
    await useColaVentasStore.getState().sincronizar()

    const registros = await idb.todos(ALMACEN_VENTAS)
    const e = registros.find((r) => r.id_cliente === 'e')
    expect(e).toMatchObject({ estado: 'error', resultado: 'conflicto' })
    expect(e.error).toContain('Polera: se pidieron 2, hay 1')
    // Rollback local: la rechazada deja de apartar stock; la otra sigue pendiente.
    expect(unidadesEnColaPorStock(registros).get(10)).toBe(1)
    await useHistorialStore.getState().cargar()
    expect(useHistorialStore.getState().registros.some((h) => h.id_cliente === 'e' && h.resultado === 'conflicto')).toBe(true)
  })

  it('conflicto de precio: se autoriza con un supervisor y la contraseña no queda guardada', async () => {
    enviarLote.mockReset() // sin respuestas sobrantes de otras pruebas
    const precios = [{ producto_sucursal_id: 10, producto: 'Polera', cobrado: '90.00', actual: '100.00' }]
    enviarLote.mockResolvedValueOnce(
      new Map([['h', { id: 'h', resultado: 'conflicto', codigo: 'PRECIO_CAMBIADO', mensaje: 'El precio cambio', precios }]]),
    )
    const v = venta('h')
    v.payload.detalles[0].precio = '90.00'
    v.payload.total = '180.00'
    await useColaVentasStore.getState().encolar(v)
    await useColaVentasStore.getState().sincronizar()
    expect(await idb.obtener(ALMACEN_VENTAS, 'h')).toMatchObject({ estado: 'error', codigo: 'PRECIO_CAMBIADO', precios })

    // Contraseña equivocada: sigue siendo un conflicto de precio que se puede volver a autorizar.
    enviarLote.mockResolvedValueOnce(new Map([['h', { id: 'h', resultado: 'rechazada', codigo_http: 403, mensaje: 'Falta autorizacion' }]]))
    await useColaVentasStore.getState().autorizarPrecios('h', { username: 'admin', password: 'mala' })
    expect(await idb.obtener(ALMACEN_VENTAS, 'h')).toMatchObject({ estado: 'error', resultado: 'conflicto', codigo: 'PRECIO_CAMBIADO' })

    enviarLote.mockResolvedValueOnce(new Map([['h', { id: 'h', resultado: 'confirmada', servidor_id: 99 }]]))
    await useColaVentasStore.getState().autorizarPrecios('h', { username: 'admin', password: 'admin123' })
    const enviado = enviarLote.mock.calls.at(-1)[0][0]
    expect(enviado.datos).toMatchObject({
      respetar_precios: true,
      autorizacion: { username: 'admin', password: 'admin123' },
      total: '180.00',
      detalles: [{ producto_sucursal_id: 10, cantidad: 2, precio: '90.00' }],
    })
    expect(emitirTicket).toHaveBeenCalledWith({ id: 99 })
    expect(await idb.todos(ALMACEN_VENTAS)).toHaveLength(0)
    expect(JSON.stringify(await idb.todos(ALMACEN_HISTORIAL))).not.toContain('admin123')
  })

  it('descartar una rechazada la saca de la cola pero deja rastro en el historial', async () => {
    await useColaVentasStore.getState().encolar(venta('g'))
    await useColaVentasStore.getState().descartar('g')
    expect(await idb.todos(ALMACEN_VENTAS)).toHaveLength(0)
    await useHistorialStore.getState().cargar()
    expect(useHistorialStore.getState().registros[0]).toMatchObject({ id_cliente: 'g', resultado: 'descartada' })
  })
})
