import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'
import Skeleton from '@/shared/components/Skeleton'
import { cx } from '@/shared/utils/clases'
import { plataformaService } from '@/features/empresa/services/empresa.service'

const OPCIONES_MESES = [1, 3, 6, 12]

function estadoSuscripcion(e) {
  if (e.estado === 'suspendida') return { texto: 'Suspendida', clase: 'bg-error/10 text-error' }
  if (e.dias_restantes === null) return { texto: 'Sin plan', clase: 'bg-error/10 text-error' }
  if (e.dias_restantes < 0) return { texto: 'Vencida', clase: 'bg-error/10 text-error' }
  if (e.dias_restantes <= 7) return { texto: `Vence en ${e.dias_restantes} d`, clase: 'bg-amber-100 text-amber-800' }
  return { texto: 'Activa', clase: 'bg-green-100 text-green-800' }
}

export default function PlataformaEmpresas() {
  const [empresas, setEmpresas] = useState(null)
  const [planes, setPlanes] = useState([])
  const [error, setError] = useState(null)

  /** { tipo: 'plan' | 'renovar', empresa } */
  const [accion, setAccion] = useState(null)
  const [planElegido, setPlanElegido] = useState('')
  const [meses, setMeses] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [errorAccion, setErrorAccion] = useState(null)

  const pedir = useCallback(() => {
    Promise.all([plataformaService.empresas(), plataformaService.planes()])
      .then(([lista, listaPlanes]) => {
        setEmpresas(lista)
        setPlanes(listaPlanes)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    pedir()
  }, [pedir])

  const cargar = () => {
    setError(null)
    pedir()
  }

  const abrir = (tipo, empresa) => {
    setMeses(1)
    setPlanElegido(empresa.plan_codigo ?? planes[0]?.codigo ?? '')
    setErrorAccion(null)
    setAccion({ tipo, empresa })
  }

  const confirmar = async () => {
    const { tipo, empresa } = accion
    setEnviando(true)
    setErrorAccion(null)
    try {
      if (tipo === 'renovar') await plataformaService.renovar(empresa.id, meses)
      else await plataformaService.asignarPlan(empresa.id, planElegido, meses)
      toast.exito(tipo === 'renovar' ? `${empresa.nombre}: suscripción renovada` : `${empresa.nombre}: plan actualizado`)
      setAccion(null)
      cargar()
    } catch (e) {
      setErrorAccion(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const alternarEstado = async (empresa) => {
    const nuevo = empresa.estado === 'activa' ? 'suspendida' : 'activa'
    try {
      await plataformaService.cambiarEstado(empresa.id, nuevo)
      toast.exito(`${empresa.nombre}: ${nuevo === 'activa' ? 'reactivada' : 'suspendida'}`)
      cargar()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const total = (campo) => (empresas ?? []).reduce((suma, e) => suma + (e[campo] ?? 0), 0)

  let contenido
  if (error) {
    contenido = (
      <div className="tarjeta py-16 text-center">
        <p className="text-on-surface">No pudimos cargar las empresas</p>
        <p className="mt-1 text-sm text-on-surface-variant">{error}</p>
        <button type="button" className="btn-secundario mt-6" onClick={cargar}>
          Reintentar
        </button>
      </div>
    )
  } else if (!empresas) {
    contenido = <Skeleton tipo="tarjetas" cantidad={3} />
  } else {
    contenido = (
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-left text-xs uppercase text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Vence</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Sucursales</th>
              <th className="px-4 py-3 text-right">Usuarios</th>
              <th className="px-4 py-3 text-right">Ventas</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const estado = estadoSuscripcion(e)
              return (
                <tr key={e.id} className="border-t border-outline-variant">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-on-surface">{e.nombre}</p>
                    <p className="text-xs text-on-surface-variant">
                      <code>{e.slug}</code>
                      {e.correo ? ` · ${e.correo}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">{e.plan_nombre ?? '—'}</td>
                  <td className="px-4 py-3">{e.fecha_vencimiento ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', estado.clase)}>
                      {estado.texto}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.sucursales}
                    {e.max_sucursales ? ` / ${e.max_sucursales}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right">{e.usuarios}</td>
                  <td className="px-4 py-3 text-right">{e.ventas}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" className="btn-icono" title="Cambiar plan" onClick={() => abrir('plan', e)}>
                        <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
                      </button>
                      <button
                        type="button"
                        className="btn-icono"
                        title="Renovar"
                        disabled={!e.plan_codigo}
                        onClick={() => abrir('renovar', e)}
                      >
                        <span className="material-symbols-outlined text-[20px]">autorenew</span>
                      </button>
                      <button
                        type="button"
                        className={e.estado === 'activa' ? 'btn-icono-peligro' : 'btn-icono'}
                        title={e.estado === 'activa' ? 'Suspender' : 'Reactivar'}
                        onClick={() => alternarEstado(e)}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {e.estado === 'activa' ? 'block' : 'check_circle'}
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Empresas</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Empresas suscritas a la plataforma, su plan y lo que usan.
          </p>
        </div>

        {empresas && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ['Empresas', empresas.length],
              ['Activas', empresas.filter((e) => e.estado === 'activa').length],
              ['Sucursales', total('sucursales')],
              ['Ventas registradas', total('ventas')],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta} className="tarjeta">
                <p className="text-xs text-on-surface-variant">{etiqueta}</p>
                <p className="mt-1 text-2xl font-semibold text-on-surface">{valor}</p>
              </div>
            ))}
          </div>
        )}

        {contenido}
      </div>

      {accion && (
        <Modal
          titulo={`${accion.tipo === 'renovar' ? 'Renovar' : 'Plan de'} ${accion.empresa.nombre}`}
          onCerrar={() => setAccion(null)}
          footer={
            <>
              <button type="button" className="btn-secundario" onClick={() => setAccion(null)} disabled={enviando}>
                Cancelar
              </button>
              <button type="button" className="btn-primario" onClick={confirmar} disabled={enviando}>
                {enviando ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {accion.tipo === 'plan' && (
              <div>
                <label className="etiqueta" htmlFor="plan">
                  Plan
                </label>
                <select
                  id="plan"
                  className="campo"
                  value={planElegido}
                  onChange={(ev) => setPlanElegido(ev.target.value)}
                >
                  {planes.map((p) => (
                    <option key={p.codigo} value={p.codigo} disabled={!p.activo}>
                      {p.nombre} (hasta {p.max_sucursales} sucursales){p.activo ? '' : ' — desactivado'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="etiqueta" htmlFor="meses">
                Meses
              </label>
              <select id="meses" className="campo" value={meses} onChange={(ev) => setMeses(Number(ev.target.value))}>
                {OPCIONES_MESES.map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? 'mes' : 'meses'}
                  </option>
                ))}
              </select>
            </div>
            {errorAccion && <p className="text-sm text-error">{errorAccion}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}
