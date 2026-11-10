import { useCallback, useEffect, useState } from 'react'
import { useSuscripcionStore } from '@/core/stores/suscripcion.store'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'
import Skeleton from '@/shared/components/Skeleton'
import { cx } from '@/shared/utils/clases'
import { ETIQUETA_ESTADO, FUNCIONES_DE_PLAN, empresaService } from '../services/empresa.service'

const COLOR_ESTADO = {
  activa: 'bg-green-100 text-green-800',
  vencida: 'bg-error/10 text-error',
  sin_suscripcion: 'bg-error/10 text-error',
  empresa_suspendida: 'bg-error/10 text-error',
}

const OPCIONES_MESES = [1, 3, 6, 12]

function Uso({ etiqueta, usado, maximo }) {
  const porcentaje = maximo ? Math.min(100, Math.round((usado / maximo) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-on-surface-variant">{etiqueta}</span>
        <span className="font-semibold text-on-surface">{maximo ? `${usado} de ${maximo}` : usado}</span>
      </div>
      {maximo ? (
        <div className="h-2 overflow-hidden rounded-full bg-surface-container">
          <div
            className={cx('h-full rounded-full', porcentaje >= 100 ? 'bg-error' : 'bg-primary')}
            style={{ width: `${porcentaje}%` }}
          ></div>
        </div>
      ) : null}
    </div>
  )
}

export default function MiPlan() {
  const [datos, setDatos] = useState(null)
  const [planes, setPlanes] = useState([])
  const [historial, setHistorial] = useState([])
  const [error, setError] = useState(null)

  /** { tipo: 'cambiar' | 'renovar', plan? } */
  const [accion, setAccion] = useState(null)
  const [meses, setMeses] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [errorAccion, setErrorAccion] = useState(null)

  const establecerGlobal = useSuscripcionStore((s) => s.establecer)

  const pedir = useCallback(() => {
    Promise.all([empresaService.actual(), empresaService.planes(), empresaService.historial()])
      .then(([actual, listaPlanes, lista]) => {
        setDatos(actual)
        setPlanes(listaPlanes)
        setHistorial(lista)
        establecerGlobal(actual)
      })
      .catch((e) => setError(e.message))
  }, [establecerGlobal])

  useEffect(() => {
    pedir()
  }, [pedir])

  const cargar = () => {
    setError(null)
    pedir()
  }

  const abrir = (tipo, plan = null) => {
    setMeses(1)
    setErrorAccion(null)
    setAccion({ tipo, plan })
  }

  const confirmar = async () => {
    setEnviando(true)
    setErrorAccion(null)
    try {
      const nuevo =
        accion.tipo === 'renovar'
          ? await empresaService.renovar(meses)
          : await empresaService.cambiarPlan(accion.plan.codigo, meses)
      setDatos(nuevo)
      establecerGlobal(nuevo)
      setHistorial(await empresaService.historial())
      toast.exito(accion.tipo === 'renovar' ? 'Suscripción renovada' : `Ahora tienes el plan ${nuevo.plan.nombre}`)
      setAccion(null)
    } catch (e) {
      setErrorAccion(e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (error) {
    return (
      <div className="tarjeta mx-auto max-w-[1100px] py-16 text-center">
        <p className="text-on-surface">No pudimos cargar tu plan</p>
        <p className="mt-1 text-sm text-on-surface-variant">{error}</p>
        <button type="button" className="btn-secundario mt-6" onClick={cargar}>
          Reintentar
        </button>
      </div>
    )
  }
  if (!datos) return <Skeleton tipo="tarjetas" cantidad={3} />

  const { plan, empresa, uso, estado } = datos
  const precio = (p) => `Bs ${Number(p.precio_mensual)}`

  return (
    <>
      <div className="mx-auto max-w-[1100px] space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Mi plan</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {empresa?.nombre} · tienda <code>{empresa?.slug}</code>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="tarjeta lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Plan actual</p>
                <h2 className="mt-1 text-2xl font-semibold text-primary">{plan?.nombre ?? 'Sin plan'}</h2>
                {plan && <p className="text-sm text-on-surface-variant">{precio(plan)} por mes</p>}
              </div>
              <span className={cx('rounded-full px-3 py-1 text-xs font-semibold', COLOR_ESTADO[estado])}>
                {ETIQUETA_ESTADO[estado] ?? estado}
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-on-surface-variant">Inicio</dt>
                <dd className="font-semibold text-on-surface">{datos.fecha_inicio ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Vence</dt>
                <dd className="font-semibold text-on-surface">{datos.fecha_vencimiento ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Días restantes</dt>
                <dd className={cx('font-semibold', (datos.dias_restantes ?? 0) < 0 ? 'text-error' : 'text-on-surface')}>
                  {datos.dias_restantes ?? '—'}
                </dd>
              </div>
            </dl>

            {plan && (
              <ul className="mt-5 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                {FUNCIONES_DE_PLAN.map((f) => (
                  <li
                    key={f.clave}
                    className={cx('flex items-center gap-2', plan[f.clave] ? 'text-on-surface' : 'text-outline')}
                  >
                    <span
                      className={cx(
                        'material-symbols-outlined text-[18px]',
                        plan[f.clave] ? 'text-green-700' : 'text-outline',
                      )}
                    >
                      {plan[f.clave] ? 'check_circle' : 'block'}
                    </span>
                    {f.etiqueta}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-outline-variant pt-4">
              <button type="button" className="btn-primario" onClick={() => abrir('renovar')} disabled={!plan}>
                <span className="material-symbols-outlined text-[18px]">autorenew</span>
                Renovar
              </button>
            </div>
          </section>

          <section className="tarjeta space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Uso del plan</p>
            <Uso etiqueta="Sucursales" usado={uso.sucursales} maximo={plan?.max_sucursales} />
            <Uso etiqueta="Usuarios" usado={uso.usuarios} />
            <Uso etiqueta="Productos" usado={uso.productos} />
          </section>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-on-surface">Planes disponibles</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {planes.map((p) => {
              const esActual = p.codigo === plan?.codigo
              const noAlcanza = uso.sucursales > p.max_sucursales
              return (
                <article
                  key={p.codigo}
                  className={cx('tarjeta flex flex-col', esActual && 'border-primary ring-1 ring-primary')}
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-semibold text-on-surface">{p.nombre}</h3>
                    <span className="font-semibold text-primary">{precio(p)}/mes</span>
                  </div>
                  <p className="mt-1 text-sm text-on-surface-variant">{p.descripcion}</p>
                  <p className="mt-3 text-sm text-on-surface">Hasta {p.max_sucursales} sucursales</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {FUNCIONES_DE_PLAN.map((f) => (
                      <li
                        key={f.clave}
                        className={cx('flex items-center gap-2', p[f.clave] ? 'text-on-surface' : 'text-outline line-through')}
                      >
                        <span className="material-symbols-outlined text-[16px]">{p[f.clave] ? 'check' : 'close'}</span>
                        {f.etiqueta}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4">
                    {esActual ? (
                      <span className="chip-suave">Plan actual</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-secundario w-full"
                        disabled={noAlcanza}
                        title={noAlcanza ? `Tienes ${uso.sucursales} sucursales; este plan permite ${p.max_sucursales}` : undefined}
                        onClick={() => abrir('cambiar', p)}
                      >
                        Cambiar a {p.nombre}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="tarjeta p-0">
          <h2 className="border-b border-outline-variant px-5 py-3 text-lg font-semibold text-on-surface">
            Historial de suscripciones
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-left text-xs uppercase text-on-surface-variant">
                <tr>
                  <th className="px-5 py-2">Plan</th>
                  <th className="px-5 py-2">Inicio</th>
                  <th className="px-5 py-2">Vence</th>
                  <th className="px-5 py-2">Estado</th>
                  <th className="px-5 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((s) => (
                  <tr key={s.id} className="border-t border-outline-variant">
                    <td className="px-5 py-2 font-semibold">{s.plan?.nombre}</td>
                    <td className="px-5 py-2">{s.fecha_inicio}</td>
                    <td className="px-5 py-2">{s.fecha_vencimiento}</td>
                    <td className="px-5 py-2 capitalize">{s.estado}</td>
                    <td className="px-5 py-2 text-on-surface-variant">{s.observacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {accion && (
        <Modal
          titulo={accion.tipo === 'renovar' ? `Renovar plan ${plan?.nombre}` : `Cambiar al plan ${accion.plan.nombre}`}
          onCerrar={() => setAccion(null)}
          footer={
            <>
              <button type="button" className="btn-secundario" onClick={() => setAccion(null)} disabled={enviando}>
                Cancelar
              </button>
              <button type="button" className="btn-primario" onClick={confirmar} disabled={enviando}>
                {enviando ? 'Procesando...' : 'Confirmar pago simulado'}
              </button>
            </>
          }
        >
          <label className="etiqueta" htmlFor="meses">
            Meses a contratar
          </label>
          <select id="meses" className="campo" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
            {OPCIONES_MESES.map((m) => (
              <option key={m} value={m}>
                {m} {m === 1 ? 'mes' : 'meses'}
              </option>
            ))}
          </select>
          <p className="mt-3 text-sm text-on-surface-variant">
            Total: Bs {Number((accion.plan ?? plan).precio_mensual) * meses}.{' '}
            {accion.tipo === 'renovar'
              ? 'Los meses se suman al vencimiento actual.'
              : 'El nuevo plan empieza hoy y reemplaza al actual.'}
          </p>
          {errorAccion && <p className="mt-3 text-sm text-error">{errorAccion}</p>}
        </Modal>
      )}
    </>
  )
}
