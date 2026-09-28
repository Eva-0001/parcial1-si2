import { Link } from 'react-router'
import { ETIQUETA_METODO } from '@/features/pos/pos.utils'
import { numeroVenta } from '@/features/ventas/ventas.utils'
import { formatoFecha } from '@/shared/utils/formato'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'
import { nombreCompleto } from '../caja.utils'

export function TablaMovimientosCaja({ movimientos }) {
  if (movimientos.length === 0) {
    return <p className="py-6 text-center text-sm text-on-surface-variant">Sin ingresos ni egresos de efectivo.</p>
  }
  return (
    <div className="tabla overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Tipo</th>
            <th>Motivo</th>
            <th>Registró</th>
            <th className="text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td className="tabular-nums text-on-surface-variant">{formatoFecha(m.creado_en, 'dd/MM HH:mm')}</td>
              <td>
                <span className={cx('chip', m.tipo === 'ingreso' ? 'text-success' : 'text-error')}>
                  {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                </span>
              </td>
              <td>{m.motivo}</td>
              <td className="text-on-surface-variant">{m.usuario?.username ?? '—'}</td>
              <td className={cx('text-right font-semibold tabular-nums', m.tipo === 'egreso' && 'text-error')}>
                {m.tipo === 'egreso' ? '−' : ''}
                {monedaBs(m.monto)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TablaVentasTurno({ ventas, conEnlace = false }) {
  if (ventas.length === 0) {
    return <p className="py-6 text-center text-sm text-on-surface-variant">Todavía no se cobró ninguna venta en este turno.</p>
  }
  return (
    <div className="tabla overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Venta</th>
            <th>Hora</th>
            <th>Cliente</th>
            <th>Método</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.id}>
              <td className="font-semibold">
                {conEnlace ? (
                  <Link to={`/panel/ventas/${v.id}`} className="text-primary hover:underline">
                    {numeroVenta(v.id)}
                  </Link>
                ) : (
                  numeroVenta(v.id)
                )}
              </td>
              <td className="tabular-nums text-on-surface-variant">{formatoFecha(v.creada_en, 'HH:mm')}</td>
              <td>{nombreCompleto(v.usuario)}</td>
              <td>{v.metodo_pago ? ETIQUETA_METODO[v.metodo_pago] : '—'}</td>
              <td className="text-right font-semibold tabular-nums">{monedaBs(v.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
