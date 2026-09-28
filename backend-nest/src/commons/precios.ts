import { aCentavos, deCentavos } from './dinero.js';

export const MINIMO_MAYOR_POR_DEFECTO = 6;

export interface LineaAPrecio {
  /** Clave de la linea (producto_sucursal_id). */
  clave: number;
  cantidad: number;
  /** Precio por menor de la sucursal. */
  precio: string;
  /** Precio por mayor del producto; nulo si no se vende por mayor. */
  precio_mayor: string | null;
  minimo_mayor: number;
}

export interface PrecioAplicado {
  precio: string;
  precio_lista: string;
  por_mayor: boolean;
}

/**
 * Precio por mayor "surtido": las prendas que tienen precio por mayor suman unidades
 * entre si (cualquier modelo, talla o color). Una linea se cobra por mayor cuando ese
 * total alcanza el minimo de su producto. Nunca cobra mas que el precio de la sucursal.
 */
export function aplicarPrecios(
  lineas: LineaAPrecio[],
): Map<number, PrecioAplicado> {
  const unidadesMayoristas = lineas
    .filter((l) => l.precio_mayor !== null)
    .reduce((acc, l) => acc + l.cantidad, 0);

  return new Map(
    lineas.map((l) => {
      const lista = aCentavos(l.precio);
      const califica =
        l.precio_mayor !== null && unidadesMayoristas >= l.minimo_mayor;
      const aplicado = califica
        ? Math.min(lista, aCentavos(l.precio_mayor!))
        : lista;
      return [
        l.clave,
        {
          precio: deCentavos(aplicado),
          precio_lista: deCentavos(lista),
          por_mayor: aplicado < lista,
        },
      ];
    }),
  );
}
