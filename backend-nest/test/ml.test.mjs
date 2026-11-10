/** Modulo de analitica: entrenamiento, metricas y acceso por empresa y rol. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pedir, token } from './entorno.mjs'

describe('Analitica inteligente (ML)', () => {
  it('sin entrenar, las predicciones lo dicen claramente', async () => {
    const r = await pedir('GET', '/ml/predicciones', { token: await token('admin.urban') })
    assert.equal(r.status, 422)
  })

  it('entrena Random Forest y K-means con metricas validas', { timeout: 120000 }, async () => {
    const B = await token('admin.urban')
    const r = await pedir('POST', '/ml/entrenar', { token: B, cuerpo: {} })
    assert.equal(r.status, 200)

    const m = r.cuerpo.demanda.metricas
    assert.ok(r.cuerpo.datos.semanas >= 70, 'historial sintetico de ~18 meses')
    assert.ok(m.r2 > 0.5 && m.r2 <= 1, `R² razonable (${m.r2})`)
    assert.ok(m.mae > 0 && m.rmse >= m.mae)
    assert.ok(r.cuerpo.demanda.filas_prueba > 0, 'se evalua con datos que el modelo no vio')
    assert.equal(r.cuerpo.demanda.resultados.pronostico_total.length, 4)

    const s = r.cuerpo.segmentos.metricas
    assert.ok(s.k_elegido >= 2 && s.k_elegido <= 6)
    assert.ok(s.silhouette > 0)
    const nombres = r.cuerpo.segmentos.resultados.segmentos.map((x) => x.nombre)
    assert.ok(nombres.includes('Clientes VIP'))
  })

  it('cada empresa ve solo sus modelos y el encargado no entrena', async () => {
    const otra = await pedir('GET', '/ml/predicciones', { token: await token('admin') })
    assert.equal(otra.status, 422, 'FashionStore todavia no entreno: no ve el modelo de Urban Wear')
    const encargado = await pedir('POST', '/ml/entrenar', { token: await token('ecabrera'), cuerpo: {} })
    assert.equal(encargado.status, 403)
  })
})
