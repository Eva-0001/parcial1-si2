import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { cajaService } from '../services/caja.service'
import { nombreCompleto, numeroTurno } from '../caja.utils'
import ResumenArqueo from '../components/ResumenArqueo'
import { TablaMovimientosCaja, TablaVentasTurno } from '../components/TablasTurno'
import { useAuth } from '@/core/stores/auth.store'
import Skeleton from '@/shared/components/Skeleton'
import { formatoFecha } from '@/shared/utils/formato'

export default function TurnoDetalle() {
  const { id } = useParams()
  return <Detalle key={id} id={Number(id)} />
}

function Detalle({ id }) {
  const auth = useAuth()
  const [detalle, setDetalle] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    cajaService
      .obtenerTurno(id)
      .then(setDetalle)
      .catch((e) => setError(e.status === 404 ? 'El turno no existe.' : e.message))
  }, [id])

  if (error) {
    return (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <span className="material-symbols-outlined text-[48px] text-error">error</span>
        <h1 className="mt-2 text-xl font-semibold text-on-surface">{error}</h1>
        <Link to="/panel/turnos" className="btn-secundario mt-6">
          Volver a los turnos
        </Link>
      </div>
    )
  }
  if (!detalle) return <Skeleton tipo="bloque" />

  const { turno, resumen, movimientos, ventas } = detalle
  const abierto = !turno.cerrado_en

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link to="/panel/turnos" className="mb-2 inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span> Turnos
          </Link>
          <h1 className="flex items-center gap-3 text-3xl font-semibold text-on-surface">
            {numeroTurno(turno.id)}
            <span className={abierto ? 'chip text-success' : 'chip-suave'}>{abierto ? 'Abierto' : 'Cerrado'}</span>
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {turno.sucursal?.nombre} · {nombreCompleto(turno.cajero)} · {formatoFecha(turno.abierto_en, 'dd/MM/yyyy HH:mm')}
            {turno.cerrado_en ? ` → ${formatoFecha(turno.cerrado_en, 'dd/MM/yyyy HH:mm')}` : ''}
          </p>
        </div>
        <button type="button" className="btn-secundario no-imprimir" onClick={() => window.print()}>
          <span className="material-symbols-outlined text-[18px]">print</span> Imprimir arqueo
        </button>
      </header>

      <ResumenArqueo turno={turno} resumen={resumen} />

      <section className="tarjeta p-0">
        <h2 className="border-b border-outline-variant px-6 py-4 text-sm font-semibold text-on-surface">
          Movimientos de efectivo
        </h2>
        <TablaMovimientosCaja movimientos={movimientos} />
      </section>

      <section className="tarjeta p-0">
        <h2 className="border-b border-outline-variant px-6 py-4 text-sm font-semibold text-on-surface">Ventas del turno</h2>
        <TablaVentasTurno ventas={ventas} conEnlace={auth.esAdmin} />
      </section>
    </div>
  )
}
