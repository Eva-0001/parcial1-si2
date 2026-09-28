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
