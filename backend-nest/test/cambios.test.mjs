/** Cambios de prendas dentro del plazo de la empresa. */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { pedir, sql, token, uno } from './entorno.mjs'

describe('Cambios de prendas', () => {
  let A, reciente, linea, alternativa

  before(async () => {
    A = await token('admin')
    reciente = (
      await uno(
        `SELECT v.id FROM ventas v JOIN detalle_venta d ON d.venta_id = v.id
          WHERE v.empresa_id = 1 AND v.cancelada_en IS NULL AND v.creada_en > now() - interval '10 days'
          GROUP BY v.id HAVING min(d.cantidad) >= 1 ORDER BY v.id DESC LIMIT 1`,
      )
    ).id
    const info = await pedir('GET', `/cambios/venta/${reciente}`, { token: A })
    assert.equal(info.status, 200)
    linea = info.cuerpo.lineas[0]
    alternativa = info.cuerpo.alternativas.find(
      (a) => a.sucursal_id === linea.sucursal_id && a.producto_sucursal_id !== linea.producto_sucursal_id && a.disponible >= 1,
    )
  })

  it('dentro del plazo: devuelve una prenda al stock y descuenta la nueva', async () => {
    const stock = async (id) => (await uno(`SELECT cantidad FROM producto_sucursal WHERE id = $1`, [id])).cantidad
    const antes = [await stock(linea.producto_sucursal_id), await stock(alternativa.producto_sucursal_id)]
    const r = await pedir('POST', '/cambios', {
      token: A,
      cuerpo: {
        venta_id: reciente,
        motivo: 'talla',
        items: [{ detalle_venta_id: linea.detalle_venta_id, cantidad: 1, producto_sucursal_nuevo_id: alternativa.producto_sucursal_id }],
      },
    })
    assert.equal(r.status, 201)
    assert.equal(await stock(linea.producto_sucursal_id), antes[0] + 1)
    assert.equal(await stock(alternativa.producto_sucursal_id), antes[1] - 1)
    const esperado = (Number(alternativa.precio) - Number(linea.precio)).toFixed(2)
    assert.equal(r.cuerpo.diferencia, esperado)
  })

  it('no se puede cambiar mas de lo que se compro', async () => {
    const r = await pedir('POST', '/cambios', {
      token: A,
      cuerpo: {
        venta_id: reciente,
        motivo: 'talla',
        items: [
          { detalle_venta_id: linea.detalle_venta_id, cantidad: linea.cantidad, producto_sucursal_nuevo_id: alternativa.producto_sucursal_id },
        ],
      },
    })
    assert.equal(r.status, 409)
  })

  it('fuera del plazo de la empresa se rechaza', async () => {
    const vieja = await uno(
      `SELECT v.id, min(d.id) AS detalle FROM ventas v JOIN detalle_venta d ON d.venta_id = v.id
        WHERE v.empresa_id = 1 AND v.creada_en < now() - interval '40 days' GROUP BY v.id LIMIT 1`,
    )
    const r = await pedir('POST', '/cambios', {
      token: A,
      cuerpo: { venta_id: vieja.id, motivo: 'color', items: [{ detalle_venta_id: vieja.detalle, cantidad: 1, producto_sucursal_nuevo_id: alternativa.producto_sucursal_id }] },
    })
    assert.equal(r.status, 422)
    assert.equal(r.cuerpo.codigo, 'FUERA_DE_PLAZO')
    assert.equal((await sql(`SELECT count(*)::int AS n FROM cambios WHERE venta_id = $1`, [vieja.id]))[0].n, 0)
  })

  it('otra empresa no ve la venta para cambiarla', async () => {
    const r = await pedir('GET', `/cambios/venta/${reciente}`, { token: await token('admin.urban') })
    assert.equal(r.status, 404)
  })
})
