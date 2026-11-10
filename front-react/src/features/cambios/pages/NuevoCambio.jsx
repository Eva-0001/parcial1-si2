import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from '@/core/stores/toast.store'
import Skeleton from '@/shared/components/Skeleton'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'
import { MOTIVOS_DE_CAMBIO, cambiosService } from '../services/cambios.service'

const fechaCorta = (iso) => new Date(`${iso.length === 10 ? `${iso}T12:00:00` : iso}`).toLocaleDateString('es-BO')
const describir = (p) => [p.producto, p.talla && `Talla ${p.talla}`, p.color].filter(Boolean).join(' · ')

/**
 * Registrar un cambio: se eligen las prendas de la venta que el cliente
 * devuelve, cuántas, y qué prenda se lleva a cambio (misma sucursal).
 */
export default function NuevoCambio() {
  const [params] = useSearchParams()
  const ventaId = Number(params.get('venta'))
  const navigate = useNavigate()

  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  /** detalle_venta_id -> { cantidad, nuevo } */
  const [eleccion, setEleccion] = useState({})
  const [verOtras, setVerOtras] = useState({})
  const [motivo, setMotivo] = useState('talla')
  const [observacion, setObservacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState(null)

  useEffect(() => {
    if (!ventaId) return
    let vigente = true
    cambiosService
      .paraVenta(ventaId)
      .then((d) => vigente && setDatos(d))
      .catch((e) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [ventaId])

  if (!ventaId) {
    return <p className="text-sm text-on-surface-variant">Falta el número de venta.</p>
  }
  if (error) {
    return (
      <div className="tarjeta mx-auto max-w-[900px] py-12 text-center">
        <p className="text-on-surface">{error}</p>
        <Link to="/panel/cambios" className="btn-secundario mt-6">
          Volver a cambios
        </Link>
      </div>
    )
  }
  if (!datos) return <Skeleton tipo="tarjetas" cantidad={2} />

  const { venta, plazo, lineas } = datos
  const alternativasDe = (linea) =>
    datos.alternativas.filter(
      (x) => x.sucursal_id === linea.sucursal_id && x.producto_sucursal_id !== linea.producto_sucursal_id,
    )
  const habilitado = plazo.dentro_del_plazo
  const precioDe = (stockId) => Number(datos.alternativas.find((a) => a.producto_sucursal_id === stockId)?.precio ?? 0)

  const items = lineas
    .map((l) => ({ linea: l, ...eleccion[l.detalle_venta_id] }))
    .filter((x) => x.cantidad > 0 && x.nuevo)
  const totalDevuelto = items.reduce((s, x) => s + Number(x.linea.precio) * x.cantidad, 0)
  const totalNuevo = items.reduce((s, x) => s + precioDe(x.nuevo) * x.cantidad, 0)
  const diferencia = Math.round((totalNuevo - totalDevuelto) * 100) / 100

  const elegir = (detalleId, cambios) =>
    setEleccion((e) => ({
      ...e,
      [detalleId]: { cantidad: 0, nuevo: null, ...e[detalleId], ...cambios },
    }))

  const guardar = async () => {
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const cambio = await cambiosService.crear({
        venta_id: venta.id,
        motivo,
        observacion: observacion.trim() || undefined,
        items: items.map((x) => ({
          detalle_venta_id: x.linea.detalle_venta_id,
          cantidad: x.cantidad,
          producto_sucursal_nuevo_id: x.nuevo,
        })),
      })
      toast.exito(`Cambio #${cambio.id} registrado`)
      navigate('/panel/cambios')
    } catch (e) {
      setErrorGuardar(e.message)
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <div>
        <Link to="/panel/cambios" className="text-xs font-semibold text-primary hover:underline">
          ← Cambios de prendas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-on-surface">Cambio de la venta #{venta.id}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {venta.cliente} · {fechaCorta(venta.fecha)} · {monedaBs(venta.total)} · venta {venta.tipo_venta}
        </p>
      </div>

      <div
        className={cx(
          'flex items-center gap-2 rounded-lg border p-3 text-sm',
          habilitado ? 'border-green-200 bg-green-50 text-green-800' : 'border-error/30 bg-error/5 text-error',
        )}
        role="status"
      >
        <span className="material-symbols-outlined text-[20px]">{habilitado ? 'event_available' : 'event_busy'}</span>
        {venta.cancelada
          ? 'La venta está anulada: no admite cambios.'
          : habilitado
            ? `Dentro del plazo: pasaron ${plazo.dias_transcurridos} de ${plazo.dias_para_cambios} días. Se puede cambiar hasta el ${fechaCorta(plazo.vence_el)}.`
            : `Fuera de plazo: pasaron ${plazo.dias_transcurridos} días y el plazo es de ${plazo.dias_para_cambios}. Venció el ${fechaCorta(plazo.vence_el)}.`}
      </div>

      <section className="tarjeta space-y-4">
        <h2 className="font-semibold text-on-surface">Prendas de la venta</h2>
        {lineas.map((l) => {
          const e = eleccion[l.detalle_venta_id] ?? {
            cantidad: 0,
            nuevo: null,
          }
          const todas = alternativasDe(l)
          const mismaPrenda = todas.filter((a) => l.modelo_id != null && a.modelo_id === l.modelo_id)
          const opciones = verOtras[l.detalle_venta_id] || mismaPrenda.length === 0 ? todas : mismaPrenda
          const agotada = l.disponible_para_cambio <= 0
          return (
            <div key={l.detalle_venta_id} className="rounded-lg border border-outline-variant p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-on-surface">{describir(l)}</p>
                <p className="text-sm text-on-surface-variant">
                  {l.cantidad} × {monedaBs(l.precio)} · {l.sucursal}
                  {l.cambiada > 0 && ` · ya cambiadas: ${l.cambiada}`}
                </p>
              </div>

              {agotada ? (
                <p className="mt-2 text-xs text-on-surface-variant">
                  Ya se cambiaron todas las unidades de esta prenda.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[140px_1fr]">
                  <div>
                    <label className="etiqueta" htmlFor={`cant-${l.detalle_venta_id}`}>
                      Devuelve
                    </label>
                    <select
                      id={`cant-${l.detalle_venta_id}`}
                      className="campo"
                      value={e.cantidad}
                      disabled={!habilitado}
                      onChange={(ev) =>
                        elegir(l.detalle_venta_id, {
                          cantidad: Number(ev.target.value),
                        })
                      }
                    >
                      {Array.from({ length: l.disponible_para_cambio + 1 }, (_, i) => (
                        <option key={i} value={i}>
                          {i === 0 ? 'No cambia' : `${i} unidad(es)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="etiqueta" htmlFor={`nuevo-${l.detalle_venta_id}`}>
                        Se lleva a cambio
                      </label>
                      {mismaPrenda.length > 0 && (
                        <label className="flex items-center gap-1 text-xs text-on-surface-variant">
                          <input
                            type="checkbox"
                            checked={!!verOtras[l.detalle_venta_id]}
                            onChange={(ev) =>
                              setVerOtras((v) => ({
                                ...v,
                                [l.detalle_venta_id]: ev.target.checked,
                              }))
                            }
                          />
                          Ver otras prendas
                        </label>
                      )}
                    </div>
                    <select
                      id={`nuevo-${l.detalle_venta_id}`}
                      className="campo"
                      value={e.nuevo ?? ''}
                      disabled={!habilitado || e.cantidad === 0}
                      onChange={(ev) =>
                        elegir(l.detalle_venta_id, {
                          nuevo: Number(ev.target.value) || null,
                        })
                      }
                    >
                      <option value="">Elegí la prenda…</option>
                      {opciones.map((a) => (
                        <option
                          key={a.producto_sucursal_id}
                          value={a.producto_sucursal_id}
                          disabled={a.disponible < e.cantidad}
                        >
                          {describir(a)} · {monedaBs(a.precio)} · {a.disponible} disp.
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="tarjeta grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="motivo">
            Motivo
          </label>
          <select
            id="motivo"
            className="campo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={!habilitado}
          >
            {MOTIVOS_DE_CAMBIO.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="observacion">
            Observación (opcional)
          </label>
          <input
            id="observacion"
            className="campo"
            maxLength={255}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            disabled={!habilitado}
          />
        </div>
      </section>

      <section className="tarjeta flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <dl className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <dt className="text-on-surface-variant">Devuelve</dt>
            <dd className="font-semibold tabular-nums">{monedaBs(totalDevuelto)}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">Se lleva</dt>
            <dd className="font-semibold tabular-nums">{monedaBs(totalNuevo)}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">Diferencia</dt>
            <dd className={cx('font-semibold tabular-nums', diferencia < 0 && 'text-primary')}>
              {diferencia > 0
                ? `El cliente paga ${monedaBs(diferencia)}`
                : diferencia < 0
                  ? `Saldo a favor ${monedaBs(-diferencia)}`
                  : 'Sin diferencia'}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn-primario"
          disabled={!habilitado || items.length === 0 || guardando}
          onClick={guardar}
        >
          <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
          {guardando ? 'Registrando...' : 'Registrar cambio'}
        </button>
      </section>
      {errorGuardar && <p className="text-sm text-error">{errorGuardar}</p>}
    </div>
  )
}
