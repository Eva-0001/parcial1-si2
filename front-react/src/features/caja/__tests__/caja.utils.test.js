import { describe, expect, it } from 'vitest'
import { arqueoConPendientes, ventasSinSincronizar } from '../caja.utils'

const turno = { id: 7, monto_inicial: '200.00' }
const resumen = {
  ventas: 2,
  total_ventas: '150.00',
  por_metodo: {
    efectivo: { cantidad: 1, total: '100.00' },
    tarjeta: { cantidad: 1, total: '50.00' },
    qr: { cantidad: 0, total: '0.00' },
  },
  ingresos: '20.00',
  egresos: '10.00',
  efectivo_esperado: '310.00',
}

const ventaPos = (extra = {}) => ({
  id_cliente: 'a1',
  creada_en: '2026-11-10T10:00:00Z',
  estado: 'pendiente',
  venta_id: null,
  payload: { metodo_pago: 'efectivo', total: '45.50' },
  ticket: { turno_id: 7, total: 45.5, unidades: 2 },
  ...extra,
})

describe('ventasSinSincronizar', () => {
  it('solo cuenta las pendientes de este turno, sin registrar y no rechazadas', () => {
    const lista = ventasSinSincronizar(
      7,
      [
        ventaPos(),
        ventaPos({ id_cliente: 'b', venta_id: 99 }),
        ventaPos({ id_cliente: 'c', estado: 'error' }),
        ventaPos({ id_cliente: 'd', ticket: { turno_id: 3, total: 1, unidades: 1 } }),
      ],
      [
        {
          id_cliente: 'p1',
          creada_en: '2026-11-10T11:00:00Z',
          estado: 'pendiente',
          venta_id: null,
          payload: { tipo_venta: 'presencial', metodo_pago: 'efectivo' },
          resumen: { total: 30, items: [{ cantidad: 1 }] },
        },
        {
          id_cliente: 'p2',
          creada_en: '2026-11-10T11:00:00Z',
          estado: 'pendiente',
          venta_id: null,
          payload: { tipo_venta: 'virtual', metodo_pago: 'qr' },
          resumen: { total: 30, items: [{ cantidad: 1 }] },
        },
      ],
    )
    expect(lista.map((v) => v.id_cliente)).toEqual(['a1', 'p1'])
  })
})

describe('arqueoConPendientes', () => {
  it('sin pendientes devuelve el arqueo del servidor', () => {
    expect(arqueoConPendientes(turno, resumen, [])).toBe(resumen)
  })

  it('suma las ventas pendientes al total, a su método y al efectivo esperado', () => {
    const r = arqueoConPendientes(turno, resumen, [
      { metodo_pago: 'efectivo', total: '45.50' },
      { metodo_pago: 'qr', total: 12.1 },
    ])
    expect(r.ventas).toBe(4)
    expect(r.total_ventas).toBe('207.60')
    expect(r.por_metodo.efectivo).toEqual({ cantidad: 2, total: '145.50' })
    expect(r.por_metodo.qr).toEqual({ cantidad: 1, total: '12.10' })
    // 200 inicial + 145.50 efectivo + 20 ingresos - 10 egresos
    expect(r.efectivo_esperado).toBe('355.50')
  })
})
