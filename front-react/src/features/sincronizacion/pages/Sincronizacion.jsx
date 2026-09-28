import { useState } from 'react'
import { Link } from 'react-router'
import { useColaVentasStore, useVentasEnCola } from '@/core/offline/cola-ventas.store'
import { useConexionStore } from '@/core/offline/conexion.store'
import { useAuth } from '@/core/stores/auth.store'
import { toast } from '@/core/stores/toast.store'
import { ETIQUETA_METODO } from '@/features/pos/pos.utils'
import EstadoVacio from '@/shared/components/EstadoVacio'
import ModalConfirmacion from '@/shared/components/ModalConfirmacion'
import { formatoFecha } from '@/shared/utils/formato'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'

/** Ventas cobradas sin conexión que todavía no llegaron al servidor. */
export default function Sincronizacion() {
  const auth = useAuth()
  const enLinea = useConexionStore((s) => s.enLinea)
  const { sincronizando, sincronizar, reintentar, descartar } = useColaVentasStore()
  const ventas = useVentasEnCola(auth.usuario?.id)
  const [aDescartar, setADescartar] = useState(null)

  const pendientes = ventas.filter((v) => v.estado === 'pendiente')
  const total = ventas.reduce((acc, v) => acc + Number(v.ticket.total), 0)

  const confirmarDescarte = () => {
    descartar(aDescartar.id_cliente).then(() => {
      toast.info('Venta descartada: no se registró en el sistema')
      setADescartar(null)
    })
  }

  return (
    <>
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">Sincronización</h1>
            <p className="text-sm text-on-surface-variant">
              Ventas del punto de venta cobradas sin conexión. Se envían solas cuando vuelve la red.
            </p>
          </div>
          <button
            type="button"
            className="btn-primario"
            disabled={!enLinea || sincronizando || pendientes.length === 0}
            onClick={() => sincronizar()}
          >
            <span className={cx('material-symbols-outlined text-[18px]', sincronizando && 'animate-spin')}>
              {sincronizando ? 'progress_activity' : 'cloud_upload'}
            </span>
            {sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <span className={cx('chip', enLinea ? 'text-success' : 'text-warning')}>
            <span className="material-symbols-outlined text-[16px]">{enLinea ? 'cloud_done' : 'cloud_off'}</span>
            {enLinea ? 'Con conexión' : 'Sin conexión'}
          </span>
          {ventas.length > 0 && (
            <span className="chip-suave">
              {ventas.length} {ventas.length === 1 ? 'venta' : 'ventas'} · {monedaBs(total)}
            </span>
          )}
        </div>

        {ventas.length === 0 ? (
          <div className="tarjeta">
            <EstadoVacio
              icono="cloud_done"
              titulo="Todo sincronizado"
              descripcion="No hay ventas guardadas en este equipo esperando conexión."
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {ventas.map((v) => (
              <li key={v.id_cliente} className="tarjeta p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-on-surface">
                      {formatoFecha(v.creada_en, 'dd/MM/yyyy HH:mm')} · {v.ticket.sucursal?.nombre}
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          v.estado === 'error' ? 'bg-error/10 text-error' : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        {v.estado === 'error' ? 'Con error' : v.venta_id ? 'Falta el ticket' : 'Pendiente'}
                      </span>
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {v.ticket.unidades} {v.ticket.unidades === 1 ? 'unidad' : 'unidades'} ·{' '}
                      {ETIQUETA_METODO[v.payload.metodo_pago]} ·{' '}
                      {v.ticket.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', ')}
                    </p>
                    {v.error && <p className="mt-1 text-sm text-error">{v.error}</p>}
                  </div>
                  <p className="text-lg font-bold tabular-nums">{monedaBs(v.ticket.total)}</p>
                  <div className="flex gap-2">
                    <Link to={`/panel/pos/comprobante/local/${v.id_cliente}`} className="btn-icono" title="Ver ticket">
                      <span className="material-symbols-outlined text-[20px]">receipt</span>
                    </Link>
                    {v.estado === 'error' && (
                      <button
                        type="button"
                        className="btn-secundario py-1.5"
                        disabled={!enLinea || sincronizando}
                        onClick={() => reintentar(v.id_cliente)}
                      >
                        Reintentar
                      </button>
                    )}
                    {!v.venta_id && (
                      <button type="button" className="btn-icono-peligro" title="Descartar" onClick={() => setADescartar(v)}>
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-xs text-on-surface-variant">
          Si una venta falla por falta de stock o de turno abierto, corrige la causa (abre el turno o ajusta el stock) y
          usa Reintentar. Descartar la borra de este equipo: úsalo solo si el cobro no se concretó.
        </p>
      </div>

      {aDescartar && (
        <ModalConfirmacion
          titulo="¿Descartar esta venta?"
          mensaje={`La venta de ${monedaBs(aDescartar.ticket.total)} no se registrará nunca en el sistema. Hazlo solo si devolviste el dinero o el cobro no se hizo.`}
          textoBoton="Descartar"
          onConfirmar={confirmarDescarte}
          onCancelar={() => setADescartar(null)}
        />
      )}
    </>
  )
}
