import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/core/stores/toast.store'
import Skeleton from '@/shared/components/Skeleton'
import { FUNCIONES_DE_PLAN, plataformaService } from '@/features/empresa/services/empresa.service'

/** Edición de un plan: límites y funciones son configurables desde el backend. */
function TarjetaPlan({ plan, onGuardado }) {
  const [borrador, setBorrador] = useState(() => ({
    nombre: plan.nombre,
    descripcion: plan.descripcion ?? '',
    precio_mensual: Number(plan.precio_mensual),
    max_sucursales: plan.max_sucursales,
    activo: plan.activo,
    ...Object.fromEntries(FUNCIONES_DE_PLAN.map((f) => [f.clave, plan[f.clave]])),
  }))
  const [guardando, setGuardando] = useState(false)

  const cambiar = (campo, valor) => setBorrador((b) => ({ ...b, [campo]: valor }))

  const guardar = async () => {
    setGuardando(true)
    try {
      await plataformaService.actualizarPlan(plan.id, {
        ...borrador,
        precio_mensual: Number(borrador.precio_mensual),
        max_sucursales: Number(borrador.max_sucursales),
      })
      toast.exito(`Plan ${borrador.nombre} guardado`)
      onGuardado()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <article className="tarjeta space-y-4">
      <div className="flex items-center justify-between">
        <code className="text-xs text-on-surface-variant">{plan.codigo}</code>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={borrador.activo} onChange={(e) => cambiar('activo', e.target.checked)} />
          Disponible para contratar
        </label>
      </div>
      <div>
        <label className="etiqueta" htmlFor={`nombre-${plan.id}`}>
          Nombre
        </label>
        <input
          id={`nombre-${plan.id}`}
          className="campo"
          value={borrador.nombre}
          onChange={(e) => cambiar('nombre', e.target.value)}
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor={`descripcion-${plan.id}`}>
          Descripción
        </label>
        <input
          id={`descripcion-${plan.id}`}
          className="campo"
          value={borrador.descripcion}
          onChange={(e) => cambiar('descripcion', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="etiqueta" htmlFor={`precio-${plan.id}`}>
            Precio mensual (Bs)
          </label>
          <input
            id={`precio-${plan.id}`}
            type="number"
            min="0"
            step="0.01"
            className="campo"
            value={borrador.precio_mensual}
            onChange={(e) => cambiar('precio_mensual', e.target.value)}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor={`max-${plan.id}`}>
            Máximo de sucursales
          </label>
          <input
            id={`max-${plan.id}`}
            type="number"
            min="1"
            className="campo"
            value={borrador.max_sucursales}
            onChange={(e) => cambiar('max_sucursales', e.target.value)}
          />
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="etiqueta">Funciones incluidas</legend>
        {FUNCIONES_DE_PLAN.map((f) => (
          <label key={f.clave} className="flex items-center gap-2 text-sm text-on-surface">
            <input type="checkbox" checked={borrador[f.clave]} onChange={(e) => cambiar(f.clave, e.target.checked)} />
            {f.etiqueta}
          </label>
        ))}
      </fieldset>
      <button type="button" className="btn-primario w-full" onClick={guardar} disabled={guardando}>
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </article>
  )
}

export default function PlataformaPlanes() {
  const [planes, setPlanes] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(() => {
    plataformaService
      .planes()
      .then(setPlanes)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Planes</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Los límites y funciones se aplican en el backend a todas las empresas con ese plan.
        </p>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      {!planes && !error && <Skeleton tipo="tarjetas" cantidad={2} />}
      {planes && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {planes.map((plan) => (
            <TarjetaPlan key={`${plan.id}-${plan.nombre}-${plan.max_sucursales}`} plan={plan} onGuardado={cargar} />
          ))}
        </div>
      )}
    </div>
  )
}
