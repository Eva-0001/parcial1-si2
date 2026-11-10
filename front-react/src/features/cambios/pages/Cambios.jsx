import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/core/stores/auth.store'
import { toast } from '@/core/stores/toast.store'
import { empresaService } from '@/features/empresa/services/empresa.service'
import EstadoVacio from '@/shared/components/EstadoVacio'
import Skeleton from '@/shared/components/Skeleton'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'
import { cambiosService, etiquetaMotivo, textoDiferencia } from '../services/cambios.service'

const fecha = (iso) =>
  new Date(iso).toLocaleString('es-BO', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

export default function Cambios() {
  const navigate = useNavigate()
  const { esAdmin } = useAuth()
  const [cambios, setCambios] = useState(null)
  const [error, setError] = useState(null)
  const [venta, setVenta] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [detalles, setDetalles] = useState({})

  const [plazo, setPlazo] = useState(null)
  const [editandoPlazo, setEditandoPlazo] = useState(false)
  const [nuevoPlazo, setNuevoPlazo] = useState('')

  const pedir = useCallback(() => {
    cambiosService
      .listar()
      .then(setCambios)
      .catch((e) => setError(e.message))
    empresaService
      .actual()
      .then((r) => setPlazo(r.empresa?.dias_para_cambios ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    pedir()
  }, [pedir])

  const buscar = (e) => {
    e.preventDefault()
    const id = Number(venta.replace(/\D/g, ''))
    if (id > 0) navigate(`/panel/cambios/nuevo?venta=${id}`)
  }

  const alternar = async (id) => {
    setAbierto(abierto === id ? null : id)
    if (!detalles[id]) {
      try {
        const c = await cambiosService.obtener(id)
        setDetalles((d) => ({ ...d, [id]: c.detalles }))
      } catch (e) {
        toast.error(e.message)
      }
    }
  }

  const guardarPlazo = async () => {
    try {
      const r = await empresaService.actualizar({
        dias_para_cambios: Number(nuevoPlazo),
      })
      setPlazo(r.dias_para_cambios)
      setEditandoPlazo(false)
      toast.exito('Plazo para cambios actualizado')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Cambios de prendas</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            {editandoPlazo ? (
              <>
                <span>Plazo para cambios:</span>
                <input
                  type="number"
                  min="0"
                  max="365"
                  className="campo w-20 py-1"
                  value={nuevoPlazo}
                  onChange={(e) => setNuevoPlazo(e.target.value)}
                  aria-label="Días para cambios"
                />
                <span>días</span>
                <button type="button" className="btn-primario px-3 py-1 text-xs" onClick={guardarPlazo}>
                  Guardar
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold hover:underline"
                  onClick={() => setEditandoPlazo(false)}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span>
                  El cliente tiene <strong className="text-on-surface">{plazo ?? '…'} días</strong> desde la compra para
                  cambiar una prenda.
                </span>
                {esAdmin && plazo !== null && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={() => {
                      setNuevoPlazo(String(plazo))
                      setEditandoPlazo(true)
                    }}
                  >
                    Cambiar plazo
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <form className="flex items-center gap-2" onSubmit={buscar}>
          <input
            className="campo w-48"
            placeholder="N.º de venta, ej. 125"
            value={venta}
            onChange={(e) => setVenta(e.target.value)}
            aria-label="Número de venta"
          />
          <button type="submit" className="btn-primario" disabled={!venta.trim()}>
            <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
            Nuevo cambio
          </button>
        </form>
      </div>

      {error ? (
        <div className="tarjeta py-12 text-center text-sm text-error">{error}</div>
      ) : cambios === null ? (
        <Skeleton tipo="tabla" />
      ) : cambios.length === 0 ? (
        <div className="tarjeta p-0">
          <EstadoVacio
            icono="swap_horiz"
            titulo="Todavía no hay cambios"
            descripcion="Escribe el número de la venta para registrar el primero, o entra desde el detalle de una venta."
          />
        </div>
      ) : (
        <div className="tabla overflow-x-auto rounded-xl border border-outline-variant">
          <table>
            <thead>
              <tr>
                <th>Cambio</th>
                <th>Fecha</th>
                <th>Venta</th>
                <th>Sucursal</th>
                <th>Motivo</th>
                <th className="text-right">Prendas</th>
                <th className="text-right">Diferencia</th>
                <th>Registró</th>
              </tr>
            </thead>
            <tbody>
              {cambios.map((c) => {
                const d = textoDiferencia(c.diferencia)
                return [
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-surface-container-low"
                    onClick={() => alternar(c.id)}
                  >
                    <td className="font-semibold">#{c.id}</td>
                    <td>{fecha(c.creada_en)}</td>
                    <td>#{c.venta_id}</td>
                    <td>{c.sucursal}</td>
                    <td>{etiquetaMotivo(c.motivo)}</td>
                    <td className="text-right tabular-nums">{c.prendas}</td>
                    <td className={cx('text-right tabular-nums', d.clase)}>{d.texto}</td>
                    <td>@{c.registrado_por}</td>
                  </tr>,
                  abierto === c.id && (
                    <tr key={`${c.id}-detalle`}>
                      <td colSpan={8} className="bg-surface-container-low">
                        {(detalles[c.id] ?? []).map((x, i) => (
                          <p key={i} className="text-sm">
                            {x.cantidad} × <span className="text-on-surface-variant">{x.devuelta}</span> (
                            {monedaBs(x.precio_devuelto)}){' → '}
                            <strong>{x.nueva}</strong> ({monedaBs(x.precio_nuevo)})
                          </p>
                        ))}
                        {c.observacion && (
                          <p className="mt-1 text-xs text-on-surface-variant">Observación: {c.observacion}</p>
                        )}
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
