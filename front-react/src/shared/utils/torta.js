/** Partes de una torta: colores validados en orden fijo y la cola agrupada en "Otros". */
export const COLORES_TORTA = ['#4f46e5', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
const COLOR_OTROS = '#94a3b8'
const MAXIMO_PARTES = 6

/** Ordena de mayor a menor y junta la cola en "Otros" si hay más de 6 partes. */
export function partesDeTorta(datos) {
  const ordenados = datos.filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor)
  const partes =
    ordenados.length <= MAXIMO_PARTES
      ? ordenados
      : [
          ...ordenados.slice(0, MAXIMO_PARTES - 1),
          {
            etiqueta: 'Otros',
            valor: ordenados.slice(MAXIMO_PARTES - 1).reduce((s, d) => s + d.valor, 0),
            detalle: `${ordenados.length - (MAXIMO_PARTES - 1)} más`,
            otros: true,
          },
        ]
  return partes.map((p, i) => ({ ...p, color: p.otros ? COLOR_OTROS : COLORES_TORTA[i] }))
}
