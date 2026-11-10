/** Pruebas unitarias de funciones puras (sin base ni API), sobre el codigo compilado. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aCentavos, deCentavos, subtotalEnCentavos } from '../dist/commons/dinero.js'
import {
  ajustarEscalador,
  cuartiles,
  desescalar,
  escalar,
  mae,
  masCercano,
  r2,
  rmse,
  silhouette,
} from '../dist/commons/ml/estadistica.js'

describe('Dinero en centavos', () => {
  it('convierte sin errores de punto flotante', () => {
    assert.equal(aCentavos('190.89'), 19089)
    assert.equal(aCentavos(0.1 + 0.2), 30)
    assert.equal(deCentavos(19089), '190.89')
    assert.equal(deCentavos(-756), '-7.56')
    assert.equal(subtotalEnCentavos('33.33', 3), 9999)
  })

  it('rechaza montos invalidos', () => {
    assert.throws(() => aCentavos('12,50'))
  })
})

describe('Metricas del modelo de demanda', () => {
  it('MAE, RMSE y R² con valores conocidos', () => {
    const reales = [10, 20, 30, 40]
    const predichos = [12, 18, 33, 37]
    assert.equal(mae(reales, predichos), 2.5)
    assert.equal(Number(rmse(reales, predichos).toFixed(4)), 2.5495)
    assert.equal(r2(reales, reales), 1, 'prediccion perfecta')
    assert.equal(r2(reales, [25, 25, 25, 25]), 0, 'predecir la media')
  })
})

describe('Segmentacion (K-means)', () => {
  it('silhouette alto con grupos separados y bajo con grupos mezclados', () => {
    const puntos = [
      [0, 0], [0, 1], [1, 0],
      [10, 10], [10, 11], [11, 10],
    ]
    assert.ok(silhouette(puntos, [0, 0, 0, 1, 1, 1]) > 0.8)
    assert.ok(silhouette(puntos, [0, 1, 0, 1, 0, 1]) < 0)
  })

  it('la estandarizacion es reversible y asigna el centroide mas cercano', () => {
    const filas = [[1, 100], [3, 300], [5, 500]]
    const e = ajustarEscalador(filas)
    const z = escalar([3, 300], e)
    assert.deepEqual(z.map((v) => Math.round(v * 1e9) / 1e9), [0, 0])
    assert.deepEqual(desescalar(z, e), [3, 300])
    assert.equal(masCercano([9, 9], [[0, 0], [10, 10]]), 1)
  })

  it('cuartiles para la deteccion de ventas atipicas', () => {
    assert.deepEqual(cuartiles([1, 2, 3, 4, 5]), { q1: 2, q3: 4 })
  })
})
