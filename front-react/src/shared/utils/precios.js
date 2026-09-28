// Misma regla que el backend (commons/precios.ts): el precio por mayor es "surtido".
// Las prendas con precio por mayor suman unidades entre sí (cualquier modelo, talla o
// color) y cada línea se cobra por mayor cuando ese total alcanza el mínimo de su
// producto. El backend es quien cobra: esto solo sirve para mostrar el total antes.

export const MINIMO_MAYOR_POR_DEFECTO = 6

const aCentavos = (valor) => Math.round(Number(valor) * 100)

/**
 * @param lineas [{ clave, cantidad, precio, precio_mayor, minimo_mayor }]
 * @returns Map clave -> { precio, precio_lista, por_mayor }
 */
export function aplicarPrecios(lineas) {
  const unidadesMayoristas = lineas
    .filter((l) => l.precio_mayor !== null && l.precio_mayor !== undefined)
    .reduce((acc, l) => acc + l.cantidad, 0)

  return new Map(
    lineas.map((l) => {
      const lista = aCentavos(l.precio)
      const tieneMayor = l.precio_mayor !== null && l.precio_mayor !== undefined
      const minimo = l.minimo_mayor ?? MINIMO_MAYOR_POR_DEFECTO
      const aplicado = tieneMayor && unidadesMayoristas >= minimo ? Math.min(lista, aCentavos(l.precio_mayor)) : lista
      return [l.clave, { precio: aplicado / 100, precio_lista: lista / 100, por_mayor: aplicado < lista }]
    }),
  )
}

/**
 * Cuántas prendas surtidas faltan para el precio por mayor (0 si ya se alcanzó, null si
 * ninguna línea tiene precio por mayor).
 */
export function faltanParaMayor(lineas) {
  const conMayor = lineas.filter((l) => l.precio_mayor !== null && l.precio_mayor !== undefined)
  if (conMayor.length === 0) return null
  const unidades = conMayor.reduce((acc, l) => acc + l.cantidad, 0)
  const minimo = Math.min(...conMayor.map((l) => l.minimo_mayor ?? MINIMO_MAYOR_POR_DEFECTO))
  return Math.max(0, minimo - unidades)
}
