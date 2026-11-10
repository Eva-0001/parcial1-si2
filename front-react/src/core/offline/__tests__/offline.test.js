import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

vi.mock('../conexion.store', () => ({
  useConexionStore: create(() => ({ enLinea: true })),
  marcarConexion: vi.fn(),
  estaEnLinea: () => true,
  HEADER_DESDE_CACHE: 'x-fashionstore-cache',
}))

const { esDelCatalogo, guardarRespuesta, respuestaGuardada } = await import('../datos-locales')
const { esFalloDeEnvio, mensajeDeRechazo, quedoRegistrada } = await import('../sync-lote')
const { estadoDe } = await import('@/features/sincronizacion/estado-operacion')
const { cambiarTienda } = await import('../../stores/tienda.store')

describe('Catálogo guardado en IndexedDB', () => {
  beforeEach(() => cambiarTienda('fashionstore'))

  it('solo guarda consultas GET del catálogo', () => {
    expect(esDelCatalogo({ method: 'get', url: '/stock' })).toBe(true)
    expect(esDelCatalogo({ method: 'get', url: '/productos/12' })).toBe(true)
    expect(esDelCatalogo({ method: 'post', url: '/stock' })).toBe(false)
    expect(esDelCatalogo({ method: 'get', url: '/ventas' })).toBe(false)
    expect(esDelCatalogo({ method: 'get', url: '/usuarios' })).toBe(false)
  })

  it('distingue los parámetros y la tienda', async () => {
    await guardarRespuesta({ url: '/stock', params: { sucursal_id: 1 } }, ['de la sucursal 1'])
    await guardarRespuesta({ url: '/stock', params: { sucursal_id: 2 } }, ['de la sucursal 2'])

    const copia = await respuestaGuardada({ url: '/stock', params: { sucursal_id: 1 } })
    expect(copia.datos).toEqual(['de la sucursal 1'])
    expect(copia.guardado_en).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    cambiarTienda('urban-wear')
    expect(await respuestaGuardada({ url: '/stock', params: { sucursal_id: 1 } })).toBeNull()
  })
})

describe('Resultados del lote', () => {
  it('sabe cuándo reintentar y cuándo quedó registrada', () => {
    expect(esFalloDeEnvio({ status: 0 })).toBe(true)
    expect(esFalloDeEnvio({ status: 503 })).toBe(true)
    expect(esFalloDeEnvio({ status: 401 })).toBe(true)
    expect(esFalloDeEnvio({ status: 409 })).toBe(false)
    expect(quedoRegistrada({ resultado: 'duplicada' })).toBe(true)
    expect(quedoRegistrada({ resultado: 'conflicto' })).toBe(false)
  })

  it('explica el conflicto de stock por prenda', () => {
    const texto = mensajeDeRechazo({
      resultado: 'conflicto',
      mensaje: 'Stock insuficiente',
      conflicto: [
        { producto_sucursal_id: 1, producto: 'Polera L', pedido: 3, disponible: 1 },
        { producto_sucursal_id: 2, producto: 'Vestido', pedido: 1, disponible: 4 },
      ],
    })
    expect(texto).toBe('Conflicto de stock: Polera L: se pidieron 3, hay 1')
  })
})

describe('Estado visible de una operación', () => {
  it('local → enviando → reintentando → rechazada / conflicto', () => {
    expect(estadoDe({ estado: 'pendiente' }).clave).toBe('local')
    expect(estadoDe({ estado: 'pendiente' }, true).clave).toBe('enviando')
    expect(estadoDe({ estado: 'pendiente', intentos: 2 }).texto).toBe('Reintentando (2)')
    expect(estadoDe({ estado: 'pendiente', venta_id: 9 }).clave).toBe('registrada')
    expect(estadoDe({ estado: 'error', resultado: 'conflicto' }).clave).toBe('conflicto')
    expect(estadoDe({ estado: 'error' }).clave).toBe('rechazada')
  })
})
