import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { enviosService } from '../services/envios.service'
import {
  ACCION_SIGUIENTE,
  ESTADO_ENVIO,
  ETIQUETA_METODO_PAGO,
  estaActivo,
  estadoDePago,
  contraentregaPorCobrar,
  qrPorVerificar,
  siguienteEstado,
} from '../envios.utils'
import SeguimientoEnvio from '../components/SeguimientoEnvio'
import ModalCancelarPedido from '../components/ModalCancelarPedido'
import ComprobantePagoImagen from '../components/ComprobantePagoImagen'
import ModalRechazarComprobante from '../components/ModalRechazarComprobante'
import { numeroVenta } from '@/features/ventas/ventas.utils'
import { cargarReferencias, useReferencias } from '@/core/stores/referencias.store'
import { toast } from '@/core/stores/toast.store'
import { useAuth } from '@/core/stores/auth.store'
import Skeleton from '@/shared/components/Skeleton'
import { formatoFecha } from '@/shared/utils/formato'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'

export default function PedidoOnlineDetalle() {
  const { id } = useParams()
  return <Detalle key={id} id={Number(id)} />
}

function Detalle({ id }) {
  const referencias = useReferencias()
  const auth = useAuth()
  const [envio, setEnvio] = useState(null)
  const [error, setError] = useState(null)
  const [nota, setNota] = useState('')
  const [avanzando, setAvanzando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [rechazando, setRechazando] = useState(false)

  const pedir = useCallback(() => {
    Promise.all([enviosService.obtener(id), cargarReferencias()])
      .then(([e]) => setEnvio(e))
      .catch((e) => setError(e.status === 404 ? 'El pedido no existe.' : e.message))
  }, [id])

  useEffect(() => {
    pedir()
  }, [pedir])

  if (error) {
    return (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <span className="material-symbols-outlined text-[48px] text-error">error</span>
        <h1 className="mt-2 text-xl font-semibold text-on-surface">{error}</h1>
        <Link to="/panel/pedidos" className="btn-secundario mt-6">
          Volver a pedidos
        </Link>
      </div>
    )
  }
  if (!envio) return <Skeleton tipo="bloque" />

  const v = envio.venta
  const siguiente = siguienteEstado(envio)
  const pago = estadoDePago(v)
  const qrPendiente = qrPorVerificar(v)
  const porCobrar = contraentregaPorCobrar(v)
  // El cajero solo acepta pagos; preparar, despachar y cancelar queda para encargado y administrador.
  const gestionaEnvio = auth.tieneRol('administrador', 'encargado')
  const cobraAlEntregar =
    siguiente === 'entregado' && v.metodo_pago === 'contraentrega' && v.estado_pago === 'pendiente'

  const confirmarPagoQr = () => {
    setAvanzando(true)
    enviosService
      .confirmarPagoQr(envio.id)
      .then((actualizado) => {
        setEnvio(actualizado)
        setAvanzando(false)
        toast.exito('Pago aceptado: la compra quedó confirmada y ya puedes preparar el pedido')
      })
      .catch((e) => {
        setAvanzando(false)
        toast.error(e.message)
      })
  }

  const completarContraentrega = () => {
    setAvanzando(true)
    enviosService
      .completarContraentrega(envio.id)
      .then((actualizado) => {
        setEnvio(actualizado)
        setAvanzando(false)
        toast.exito('Cobro registrado: la venta quedó completada')
      })
      .catch((e) => {
        setAvanzando(false)
        toast.error(e.message)
      })
  }

  const avanzar = () => {
    if (!siguiente) return
    setAvanzando(true)
    enviosService
      .avanzar(envio.id, siguiente, nota.trim() || null)
      .then((actualizado) => {
        setEnvio(actualizado)
        setNota('')
        setAvanzando(false)
        toast.exito(`Pedido ${ESTADO_ENVIO[actualizado.estado].etiqueta.toLowerCase()}`)
      })
      .catch((e) => {
        setAvanzando(false)
        toast.error(e.message)
      })
  }

  return (
    <>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to="/panel/pedidos"
              className="mb-2 inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span> Pedidos online
            </Link>
            <h1 className="text-3xl font-semibold text-on-surface">Pedido {numeroVenta(v.id)}</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {v.usuario ? `${v.usuario.nombre} ${v.usuario.apellido} (@${v.usuario.username})` : ''} ·{' '}
              {formatoFecha(envio.creado_en, "d 'de' MMMM, HH:mm")}
            </p>
          </div>
          <div className="text-left lg:text-right">
            <p className="text-3xl font-bold tabular-nums text-on-surface">{monedaBs(v.total)}</p>
            <p className="flex items-center gap-2 text-sm text-on-surface-variant lg:justify-end">
              {v.metodo_pago ? ETIQUETA_METODO_PAGO[v.metodo_pago] : 'Sin método'}
              {pago && (
                <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', pago.chip)}>
                  {pago.etiqueta}
                </span>
              )}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <SeguimientoEnvio envio={envio} />

            <section className="tarjeta p-0">
              <h2 className="border-b border-outline-variant px-6 py-4 text-sm font-semibold text-on-surface">
                Prendas a preparar · {envio.sucursal?.nombre}
              </h2>
              <ul className="divide-y divide-outline-variant">
                {v.detalles.map((d) => {
                  const p = d.producto_sucursal?.producto
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                      <div>
                        <p className="font-semibold">{p?.nombre ?? 'Producto'}</p>
                        <p className="text-xs text-on-surface-variant">
                          {referencias.nombre('colores', p?.color_id)} · Talla{' '}
                          {referencias.nombre('tallas', p?.talla_id)}
                        </p>
                      </div>
                      <span className="chip">x{d.cantidad}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>

          <aside className="space-y-6 lg:col-span-5">
            {estaActivo(envio) && (
              <section className="tarjeta">
                <h2 className="text-sm font-semibold text-on-surface">Siguiente paso</h2>
                {qrPendiente && (
                  <div className="mt-3 rounded-lg bg-amber-100 p-3 text-xs text-amber-900">
                    <p className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
                      {v.tiene_comprobante
                        ? `Pago por QR de ${monedaBs(v.total)}. Revisa el comprobante y que el depósito llegó a la cuenta de la tienda.`
                        : 'El cliente eligió pagar por QR y todavía no subió el comprobante.'}
                    </p>
                    {v.tiene_comprobante && (
                      <>
                        <div className="mt-3">
                          <ComprobantePagoImagen ventaId={v.id} version={envio.eventos?.length ?? 0} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="btn-secundario border-error px-2 text-error hover:bg-error/5"
                            disabled={avanzando}
                            onClick={() => setRechazando(true)}
                          >
                            <span className="material-symbols-outlined text-[18px]">block</span> Rechazar
                          </button>
                          <button
                            type="button"
                            className="btn-primario px-2"
                            disabled={avanzando}
                            onClick={confirmarPagoQr}
                          >
                            <span className="material-symbols-outlined text-[18px]">verified</span>
                            {avanzando ? 'Guardando...' : 'Aceptar pago'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {porCobrar && (
                  <div className="mt-3 rounded-lg bg-amber-100 p-3 text-xs text-amber-900">
                    <p className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px]">payments</span>
                      {`Pago contraentrega pendiente: ${monedaBs(v.total)} en efectivo ${
                        envio.modalidad === 'domicilio' ? 'al recibir el pedido' : 'al retirar en la sucursal'
                      }. Cuando lo cobres, registra el cobro: el pedido queda entregado y la venta completada.`}
                    </p>
                    {auth.esCajero && (
                      <p className="mt-2 pl-6">Si tienes un turno abierto, el cobro entra como ingreso de tu caja.</p>
                    )}
                    <button
                      type="button"
                      className="btn-primario mt-3 w-full"
                      disabled={avanzando}
                      onClick={completarContraentrega}
                    >
                      <span className="material-symbols-outlined text-[18px]">task_alt</span>
                      {avanzando ? 'Guardando...' : 'Cobro recibido · completar venta'}
                    </button>
                  </div>
                )}
                {!gestionaEnvio && !qrPendiente && !porCobrar && (
                  <p className="mt-3 text-sm text-on-surface-variant">
                    Este pedido no tiene pagos por aceptar. La preparación y el despacho los gestiona el encargado.
                  </p>
                )}
                {gestionaEnvio && siguiente && !qrPendiente && (
                  <>
                    <input
                      type="text"
                      maxLength={255}
                      className="campo mt-3"
                      placeholder="Nota opcional (ej. repartidor Juan, guía 123)"
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                    />
                    {cobraAlEntregar && (
                      <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-xs text-amber-900">
                        <span className="material-symbols-outlined text-[16px]">payments</span>
                        Confirma solo si el repartidor cobró {monedaBs(v.total)} en efectivo: el pago queda registrado
                        como cobrado.
                      </p>
                    )}
                    <button type="button" className="btn-primario mt-3 w-full" disabled={avanzando} onClick={avanzar}>
                      <span className="material-symbols-outlined text-[18px]">{ESTADO_ENVIO[siguiente].icono}</span>
                      {avanzando ? 'Guardando...' : ACCION_SIGUIENTE[siguiente]}
                    </button>
                  </>
                )}
                {gestionaEnvio && (
                  <button
                    type="button"
                    className="btn-secundario mt-3 w-full border-error text-error hover:bg-error/5"
                    onClick={() => setCancelando(true)}
                  >
                    Cancelar pedido
                  </button>
                )}
              </section>
            )}

            <section className="tarjeta">
              <h2 className="mb-3 text-sm font-semibold text-on-surface">Historial</h2>
              <ol className="space-y-3">
                {(envio.eventos ?? []).map((ev) => (
                  <li key={ev.id} className="flex gap-3 text-sm">
                    <span className="material-symbols-outlined text-[18px] text-primary">
                      {ESTADO_ENVIO[ev.estado].icono}
                    </span>
                    <div>
                      <p className="font-semibold">{ESTADO_ENVIO[ev.estado].etiqueta}</p>
                      <p className="text-xs text-on-surface-variant">
                        {formatoFecha(ev.creado_en, 'dd/MM/yyyy HH:mm')}
                        {ev.usuario ? ` · ${ev.usuario.username}` : ''}
                      </p>
                      {ev.nota && <p className="text-xs text-on-surface">{ev.nota}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </div>

      {rechazando && (
        <ModalRechazarComprobante
          envio={envio}
          onCerrar={() => setRechazando(false)}
          onRechazado={(actualizado) => {
            setRechazando(false)
            setEnvio(actualizado)
          }}
        />
      )}

      {cancelando && (
        <ModalCancelarPedido
          envio={envio}
          pagadoConTarjeta={Boolean(v.pago_id) && v.estado_pago === 'pagado'}
          onCerrar={() => setCancelando(false)}
          onCancelado={() => {
            setCancelando(false)
            pedir()
          }}
        />
      )}
    </>
  )
}
