import { useEffect } from 'react'
import { cargarReferencias, useReferencias } from '@/core/stores/referencias.store'
import { productosService } from '@/features/productos/services/productos.service'
import { sucursalDeVenta, unidadesDeVenta } from '../ventas.utils'
import { ETIQUETA_METODO_PAGO, estadoDePago } from '@/features/pedidos/envios.utils'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { formatoFecha } from '@/shared/utils/formato'
import { cx } from '@/shared/utils/clases'

export default function ResumenVenta({ venta, fecha = null }) {
  const referencias = useReferencias()

  useEffect(() => {
    cargarReferencias().catch(() => {})
  }, [])

  const sucursal = sucursalDeVenta(venta)
  const unidades = unidadesDeVenta(venta)
  const envio = venta.envio ?? null
  const costoEnvio = Number(envio?.costo ?? 0)
  const estadoPago = estadoDePago(venta)

  const foto = (d) => {
    const p = d.producto_sucursal?.producto
    return p ? productosService.urlFoto(p) : null
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="tabla overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card lg:col-span-8">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-center">Cantidad</th>
              <th className="text-right">Precio unit.</th>
              <th className="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {venta.detalles.map((d) => {
              const f = foto(d)
              return (
                <tr key={d.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                        {f ? (
                          <img src={f} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-primary/40">
                            <span className="material-symbols-outlined text-[20px]">checkroom</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold leading-tight">{d.producto_sucursal?.producto?.nombre ?? 'Producto'}</p>
                        <p className="text-xs text-on-surface-variant">
                          {referencias.nombre('colores', d.producto_sucursal?.producto?.color_id)} · Talla{' '}
                          {referencias.nombre('tallas', d.producto_sucursal?.producto?.talla_id)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-center tabular-nums">{d.cantidad}</td>
                  <td className="text-right tabular-nums">
                    {d.precio_lista && Number(d.precio_lista) > Number(d.precio) ? (
                      <>
                        <span className="block text-xs text-on-surface-variant line-through">{monedaBs(d.precio_lista)}</span>
                        <span className="font-semibold text-success">{monedaBs(d.precio)}</span>
                      </>
                    ) : (
                      monedaBs(d.precio)
                    )}
                  </td>
                  <td className="text-right font-semibold tabular-nums">{monedaBs(Number(d.precio) * d.cantidad)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            {costoEnvio > 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-2 text-right text-sm text-on-surface-variant">
                  Envío a domicilio
                </td>
                <td className="px-6 py-2 text-right text-sm tabular-nums">{monedaBs(costoEnvio)}</td>
              </tr>
            )}
            <tr className="bg-surface-container-low">
              <td colSpan={3} className="px-6 py-3 text-right text-sm font-semibold text-on-surface-variant">
                Total ({unidades} {unidades === 1 ? 'unidad' : 'unidades'})
              </td>
              <td className="px-6 py-3 text-right text-base font-bold tabular-nums text-on-surface">{monedaBs(venta.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <aside className="space-y-4 lg:col-span-4">
        <div className="tarjeta">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <span className="material-symbols-outlined text-[20px] text-primary">store</span>
            {envio?.modalidad === 'domicilio' ? 'Despacha desde' : 'Sucursal'}
          </h3>
          {sucursal ? (
            <>
              <p className="font-semibold text-on-surface">{sucursal.nombre}</p>
              <p className="text-sm text-on-surface-variant">{sucursal.ubicacion}</p>
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">Sin sucursal registrada.</p>
          )}
          <dl className="mt-4 space-y-1.5 border-t border-outline-variant pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Tipo</dt>
              <dd className="font-medium capitalize">
                {venta.tipo_venta}
                {venta.modalidad === 'mayor' && ' · por mayor'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Fecha</dt>
              <dd className="font-medium">{fecha ? formatoFecha(fecha, 'dd/MM/yyyy HH:mm') : 'No registrada'}</dd>
            </div>
            {venta.metodo_pago && (
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Pago</dt>
                <dd className="flex items-center gap-2 font-medium">
                  {ETIQUETA_METODO_PAGO[venta.metodo_pago]}
                  {estadoPago && (
                    <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', estadoPago.chip)}>
                      {estadoPago.etiqueta}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {venta.cancelada_en && (
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Cancelada</dt>
                <dd className="font-medium text-error">{formatoFecha(venta.cancelada_en, 'dd/MM/yyyy HH:mm')}</dd>
              </div>
            )}
            {venta.usuario && (
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Cliente</dt>
                <dd className="font-medium">
                  {venta.usuario.nombre} {venta.usuario.apellido}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="tarjeta">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <span className="material-symbols-outlined text-[20px] text-primary">receipt</span>
            Comprobante
          </h3>
          {venta.comprobantes.length > 0 ? (
            <ul className="space-y-2">
              {venta.comprobantes.map((c) => (
                <li key={c.id} className="rounded-lg bg-surface-container-low p-3 text-sm">
                  <p className="font-semibold text-on-surface">{c.nombre}</p>
                  <p className="text-xs text-on-surface-variant">
                    {formatoFecha(c.fecha, 'dd/MM/yyyy HH:mm')} · {monedaBs(c.monto)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-on-surface-variant">Todavía no se emitió un comprobante para esta venta.</p>
          )}
          <button type="button" className="btn-secundario no-imprimir mt-4 w-full" onClick={() => window.print()}>
            <span className="material-symbols-outlined text-[18px]">print</span>
            Imprimir
          </button>
        </div>
      </aside>
    </div>
  )
}
