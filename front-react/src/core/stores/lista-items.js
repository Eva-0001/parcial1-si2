import { aplicarPrecios, faltanParaMayor } from '@/shared/utils/precios'

export function leerItems(clave) {
  try {
    const raw = localStorage.getItem(clave)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function persistirItems(store, clave) {
  store.subscribe((estado, previo) => {
    if (estado.items !== previo.items) localStorage.setItem(clave, JSON.stringify(estado.items))
  })
}

export function accionesItems(set, get) {
  return {
    agregar(item, cantidad = 1) {
      const lista = get().items
      const existente = lista.find((i) => i.producto_sucursal_id === item.producto_sucursal_id)
      if (existente) {
        const final = Math.min(existente.cantidad + cantidad, item.maximo)
        set({
          items: lista.map((i) =>
            i.producto_sucursal_id === item.producto_sucursal_id ? { ...i, ...item, cantidad: final } : i,
          ),
        })
        return final
      }
      const final = Math.min(cantidad, item.maximo)
      set({ items: [...lista, { ...item, cantidad: final }] })
      return final
    },

    cambiarCantidad(productoSucursalId, cantidad) {
      set({
        items: get()
          .items.map((i) =>
            i.producto_sucursal_id === productoSucursalId
              ? { ...i, cantidad: Math.min(Math.max(0, cantidad), i.maximo) }
              : i,
          )
          .filter((i) => i.cantidad > 0),
      })
    },

    quitar(productoSucursalId) {
      set({ items: get().items.filter((i) => i.producto_sucursal_id !== productoSucursalId) })
    },

    conservarSucursal(sucursalId) {
      set({ items: get().items.filter((i) => i.sucursal_id === sucursalId) })
    },

    vaciar() {
      set({ items: [] })
    },
  }
}

export function resumenItems(items) {
  const cantidadTotal = items.reduce((acc, i) => acc + i.cantidad, 0)

  // Precio por mayor surtido. Los items guardados antes de existir el precio por mayor
  // no traen esos campos y quedan por menor.
  const aLineas = items.map((i) => ({
    clave: i.producto_sucursal_id,
    cantidad: i.cantidad,
    precio: i.precio,
    precio_mayor: i.precio_mayor ?? null,
    minimo_mayor: i.minimo_mayor,
  }))
  const precios = aplicarPrecios(aLineas)
  const lineas = items.map((i) => {
    const p = precios.get(i.producto_sucursal_id)
    return { ...i, precio_aplicado: p.precio, por_mayor: p.por_mayor }
  })
  const subtotal = lineas.reduce((acc, i) => acc + i.precio_aplicado * i.cantidad, 0)
  const subtotalLista = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0)

  const vistas = new Map()
  for (const i of items) vistas.set(i.sucursal_id, i.sucursal)
  const sucursales = [...vistas.entries()].map(([id, nombre]) => ({ id, nombre }))

  return {
    cantidadTotal,
    lineas,
    subtotal,
    ahorroMayor: subtotalLista - subtotal,
    porMayor: lineas.some((i) => i.por_mayor),
    faltanParaMayor: faltanParaMayor(aLineas),
    sucursales,
    mezclado: sucursales.length > 1,
    sucursal: sucursales.length === 1 ? sucursales[0] : null,
  }
}
