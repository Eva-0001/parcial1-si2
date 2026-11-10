import { describe, expect, it } from 'vitest'
import { COLORES_TORTA, partesDeTorta } from '../torta'

const parte = (etiqueta, valor) => ({ etiqueta, valor })

describe('Partes de la torta', () => {
  it('ordena de mayor a menor con colores en orden fijo', () => {
    const partes = partesDeTorta([parte('B', 20), parte('A', 50), parte('C', 30)])
    expect(partes.map((p) => [p.etiqueta, p.color])).toEqual([
      ['A', COLORES_TORTA[0]],
      ['C', COLORES_TORTA[1]],
      ['B', COLORES_TORTA[2]],
    ])
  })

  it('con más de 6 partes junta las menores en "Otros" sin perder el total', () => {
    const datos = [80, 70, 60, 50, 40, 30, 20, 10].map((v, i) => parte(`P${i}`, v))
    const partes = partesDeTorta(datos)
    expect(partes).toHaveLength(6)
    expect(partes.at(-1)).toMatchObject({ etiqueta: 'Otros', valor: 60, otros: true })
    expect(partes.reduce((s, p) => s + p.valor, 0)).toBe(360)
  })

  it('no dibuja porciones en cero ni negativas', () => {
    expect(partesDeTorta([parte('A', 10), parte('B', 0), parte('C', -5)]).map((p) => p.etiqueta)).toEqual(['A'])
  })
})
