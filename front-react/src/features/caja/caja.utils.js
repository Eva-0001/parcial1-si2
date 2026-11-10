import { cx } from '@/shared/utils/clases'

export const numeroTurno = (id) => `T-${String(id).padStart(4, '0')}`

export const nombreCompleto = (u) => (u ? `${u.nombre} ${u.apellido}` : '—')

/** Faltante en rojo, sobrante en ámbar y cuadre exacto en verde. */
export function claseDiferencia(diferencia) {
  const n = Number(diferencia)
  return cx('font-bold tabular-nums', n < 0 ? 'text-error' : n > 0 ? 'text-warning' : 'text-success')
}

export function etiquetaDiferencia(diferencia) {
  const n = Number(diferencia)
  if (n < 0) return 'Faltante'
  if (n > 0) return 'Sobrante'
  return 'Cuadra'
}

/** Monto escrito por el usuario (acepta coma decimal) o null si no es válido. */
export function leerMonto(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.')
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(limpio)) return null
  return limpio
}

const aCentavos = (v) => Math.round(Number(v ?? 0) * 100)
const deCentavos = (c) => (c / 100).toFixed(2)

/**
 * Ventas al contado de este turno cobradas en este equipo que el servidor todavía no
 * registró: las del punto de venta (cola de ventas) y las "al contado" del checkout
 * (cola de pedidos). Las rechazadas no cuentan: su dinero no entró a la caja.
 */
export function ventasSinSincronizar(turnoId, ventasPos, pedidos) {
  const pendiente = (r) => !r.venta_id && r.estado !== 'error'
  return [
    ...ventasPos
      .filter((r) => pendiente(r) && r.ticket?.turno_id === turnoId)
      .map((r) => ({
        id_cliente: r.id_cliente,
        creada_en: r.creada_en,
        metodo_pago: r.payload.metodo_pago,
        total: r.payload.total ?? r.ticket.total,
        unidades: r.ticket?.unidades ?? 0,
      })),
    ...pedidos
      .filter((r) => pendiente(r) && r.payload.tipo_venta === 'presencial')
      .map((r) => ({
        id_cliente: r.id_cliente,
        creada_en: r.creada_en,
        metodo_pago: r.payload.metodo_pago,
        total: r.resumen.total,
        unidades: r.resumen.items.reduce((acc, i) => acc + i.cantidad, 0),
      })),
  ].sort((a, b) => a.creada_en.localeCompare(b.creada_en))
}

/** Arqueo del servidor más las ventas sin sincronizar (misma fórmula que el backend). */
export function arqueoConPendientes(turno, resumen, pendientes) {
  if (pendientes.length === 0) return resumen
  const porMetodo = Object.fromEntries(
    Object.entries(resumen.por_metodo).map(([m, f]) => [m, { cantidad: f.cantidad, total: aCentavos(f.total) }]),
  )
  let total = aCentavos(resumen.total_ventas)
  for (const v of pendientes) {
    total += aCentavos(v.total)
    porMetodo[v.metodo_pago] ??= { cantidad: 0, total: 0 }
    porMetodo[v.metodo_pago].cantidad += 1
    porMetodo[v.metodo_pago].total += aCentavos(v.total)
  }
  return {
    ...resumen,
    ventas: resumen.ventas + pendientes.length,
    total_ventas: deCentavos(total),
    por_metodo: Object.fromEntries(
      Object.entries(porMetodo).map(([m, f]) => [m, { cantidad: f.cantidad, total: deCentavos(f.total) }]),
    ),
    efectivo_esperado: deCentavos(
      aCentavos(turno.monto_inicial) +
        (porMetodo.efectivo?.total ?? 0) +
        aCentavos(resumen.ingresos) -
        aCentavos(resumen.egresos),
    ),
  }
}
