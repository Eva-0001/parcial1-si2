import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ventasService } from '@/features/ventas/services/ventas.service'
import { CHIP_TIPO, ETIQUETA_TIPO, fechaDeVenta, numeroVenta } from '@/features/ventas/ventas.utils'
import ResumenVenta from '@/features/ventas/components/ResumenVenta'
import SeguimientoEnvio from '../components/SeguimientoEnvio'
import ModalCancelarPedido from '../components/ModalCancelarPedido'
import EstadoPagoQr from '../components/EstadoPagoQr'
import Skeleton from '@/shared/components/Skeleton'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { formatoFecha } from '@/shared/utils/formato'
import { cx } from '@/shared/utils/clases'

export default function DetallePedido() {
  const { id } = useParams()

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [venta, setVenta] = useState(null)
  const [cancelando, setCancelando] = useState(false)
  const [version, setVersion] = useState(0)

  const [idCargado, setIdCargado] = useState(id)
  if (idCargado !== id) {
    setIdCargado(id)
    setCargando(true)
    setError(null)
  }

  useEffect(() => {
    ventasService
      .obtener(Number(id))
      .then((v) => {
        setVenta(v)
        setCargando(false)
      })
      .catch((e) => {
        setError(e.status === 404 || e.status === 403 ? 'No encontramos ese pedido entre los tuyos.' : e.message)
        setCargando(false)
      })
  }, [id, version])

  const fecha = venta ? fechaDeVenta(venta) : null

  let contenido = null
  if (cargando) {
    contenido = <Skeleton tipo="bloque" />
  } else if (error) {
    contenido = (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <span className="material-symbols-outlined text-[48px] text-error">error</span>
        <h1 className="mt-2 text-xl font-semibold text-on-surface">{error}</h1>
        <Link to="/pedidos" className="btn-primario mt-6">
          Ver mis pedidos
        </Link>
      </div>
    )
  } else if (venta) {
    const v = venta
    contenido = (
      <>
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Pedido</p>
            <h1 className="text-3xl font-semibold text-on-surface">{numeroVenta(v.id)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
              <span
                className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', CHIP_TIPO[v.tipo_venta])}
              >
                {ETIQUETA_TIPO[v.tipo_venta]}
              </span>
              {fecha ? formatoFecha(fecha, "d 'de' MMMM 'de' yyyy, HH:mm") : 'Fecha no registrada'}
            </p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Total</p>
            <p className="text-3xl font-bold tabular-nums text-on-surface">{monedaBs(v.total)}</p>
          </div>
        </header>

        {v.metodo_pago === 'qr' && v.estado_pago === 'pendiente' && !v.cancelada_en && (
          <EstadoPagoQr venta={v} onEnviado={() => setVersion((n) => n + 1)} />
        )}

        {v.envio && (
          <div className="mb-6">
            <SeguimientoEnvio envio={v.envio} />
            {v.envio.estado === 'pendiente' && (
              <div className="no-imprimir mt-3 flex items-center justify-between gap-3 text-sm text-on-surface-variant">
                <span>Puedes cancelar mientras la tienda no empiece a prepararlo.</span>
                <button
                  type="button"
                  className="btn-secundario border-error text-error hover:bg-error/5"
                  onClick={() => setCancelando(true)}
                >
                  Cancelar pedido
                </button>
              </div>
            )}
          </div>
        )}

        <ResumenVenta venta={v} fecha={fecha} />

        {cancelando && (
          <ModalCancelarPedido
            envio={v.envio}
            pagadoConTarjeta={Boolean(v.pago_id)}
            onCerrar={() => setCancelando(false)}
            onCancelado={() => {
              setCancelando(false)
              setVersion((n) => n + 1)
            }}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Link
        to="/pedidos"
        className="no-imprimir mb-4 inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-primary"
      >
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Volver a mis pedidos
      </Link>

      {contenido}
    </>
  )
}
