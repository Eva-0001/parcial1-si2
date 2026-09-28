import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { ETIQUETA_METODO } from '../pos.utils'
import { ALMACEN_VENTAS, idb } from '@/core/offline/idb'
import { useColaVentasStore, ventaSincronizada } from '@/core/offline/cola-ventas.store'
import Skeleton from '@/shared/components/Skeleton'
import { formatoFecha } from '@/shared/utils/formato'
import { monedaBs } from '@/shared/utils/moneda-bs'

/** Ticket provisional de una venta cobrada sin conexión (todavía sin número de comprobante). */
export default function TicketLocal() {
  const { idCliente } = useParams()
  const cobro = useLocation().state?.cobro ?? null
  // Se vuelve a leer cada vez que cambia la cola (por ejemplo, al sincronizarse).
  const cola = useColaVentasStore((s) => s.ventas)

  const [registro, setRegistro] = useState(undefined)

  useEffect(() => {
    idb
      .obtener(ALMACEN_VENTAS, idCliente)
      .then((r) => setRegistro(r ?? null))
      .catch(() => setRegistro(null))
  }, [idCliente, cola])

  if (registro === undefined) return <Skeleton tipo="bloque" />

  if (registro === null) {
    const ventaId = ventaSincronizada(idCliente)
    if (ventaId) return <Navigate to={`/panel/pos/comprobante/${ventaId}`} replace state={{ cobro }} />
    return (
      <div className="mx-auto max-w-[420px] py-4">
        <div className="tarjeta text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant">receipt_long</span>
          <p className="mt-2 font-semibold text-on-surface">Este ticket ya no está en este equipo.</p>
          <Link to="/panel/pos" className="btn-primario mt-6">
            Volver al punto de venta
          </Link>
        </div>
      </div>
    )
  }

  const t = registro.ticket
  const metodo = registro.payload.metodo_pago

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="no-imprimir mb-4 flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
        <span className="material-symbols-outlined text-[18px]">cloud_off</span>
        <span>
          {registro.estado === 'error'
            ? `No se pudo registrar: ${registro.error}`
            : 'Venta guardada sin conexión. Se registra y recibe su número de comprobante al volver la red.'}
        </span>
      </div>

      <article className="rounded-xl border border-outline-variant bg-white p-6 font-mono text-[13px] text-on-surface shadow-card print:border-0 print:shadow-none">
        <header className="border-b border-dashed border-outline pb-4 text-center">
          <p className="font-sans text-xl font-bold tracking-tight text-primary">FashionStore</p>
          {t.sucursal && (
            <>
              <p className="mt-1 font-semibold">{t.sucursal.nombre}</p>
              <p className="text-on-surface-variant">{t.sucursal.ubicacion}</p>
            </>
          )}
          <p className="mt-2 font-sans text-xs font-semibold uppercase tracking-wide text-warning">
            Comprobante provisional
          </p>
        </header>

        <dl className="space-y-1 border-b border-dashed border-outline py-3">
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Código</dt>
            <dd className="font-semibold">{registro.id_cliente.slice(0, 8).toUpperCase()}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Fecha</dt>
            <dd>{formatoFecha(registro.creada_en, 'dd/MM/yyyy HH:mm')}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Cajero</dt>
            <dd>
              {t.cajero?.nombre} {t.cajero?.apellido}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Cliente</dt>
            <dd>{t.cliente_id ? `ID ${t.cliente_id}` : 'Consumidor final'}</dd>
          </div>
        </dl>

        <table className="w-full border-b border-dashed border-outline py-3">
          <thead>
            <tr className="text-left text-[11px] uppercase text-on-surface-variant">
              <th className="py-2 font-medium">Cant.</th>
              <th className="py-2 font-medium">Detalle</th>
              <th className="py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {t.items.map((i, n) => (
              <tr key={n} className="align-top">
                <td className="py-1 pr-2 tabular-nums">{i.cantidad}</td>
                <td className="py-1 pr-2">
                  {i.nombre}
                  <span className="block text-[11px] text-on-surface-variant">
                    {[i.talla, i.color].filter(Boolean).join(' · ')} · {monedaBs(i.precio)} c/u
                    {i.precio_lista > i.precio && ' (por mayor)'}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums">{monedaBs(Number(i.precio) * i.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="space-y-1 py-3">
          <div className="flex justify-between text-on-surface-variant">
            <dt>Unidades</dt>
            <dd className="tabular-nums">{t.unidades}</dd>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <dt>TOTAL</dt>
            <dd className="tabular-nums">{monedaBs(t.total)}</dd>
          </div>
          <div className="flex justify-between text-on-surface-variant">
            <dt>Pago</dt>
            <dd>{ETIQUETA_METODO[metodo]}</dd>
          </div>
          {cobro?.metodo === 'efectivo' && cobro.pagaCon !== null && (
            <>
              <div className="flex justify-between text-on-surface-variant">
                <dt>Paga con</dt>
                <dd className="tabular-nums">{monedaBs(cobro.pagaCon)}</dd>
              </div>
              <div className="flex justify-between font-semibold text-success">
                <dt>Vuelto</dt>
                <dd className="tabular-nums">{monedaBs(cobro.vuelto)}</dd>
              </div>
            </>
          )}
        </dl>

        <footer className="border-t border-dashed border-outline pt-4 text-center text-[11px] text-on-surface-variant">
          <p>¡Gracias por tu compra!</p>
          <p>Conserva este ticket: el comprobante definitivo se emite al sincronizar.</p>
        </footer>
      </article>

      <div className="no-imprimir mt-5 flex gap-3">
        <button type="button" className="btn-secundario flex-1 py-3" onClick={() => window.print()}>
          <span className="material-symbols-outlined text-[20px]">print</span> Imprimir
        </button>
        <Link to="/panel/pos" className="btn-primario flex-1 py-3">
          <span className="material-symbols-outlined text-[20px]">add_shopping_cart</span> Nueva venta
        </Link>
      </div>
    </div>
  )
}
