import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { cajaService } from '../services/caja.service'
import { numeroTurno } from '../caja.utils'
import ResumenArqueo from '../components/ResumenArqueo'
import ModalAbrirTurno from '../components/ModalAbrirTurno'
import ModalMovimientoCaja from '../components/ModalMovimientoCaja'
import ModalCerrarTurno from '../components/ModalCerrarTurno'
import { TablaMovimientosCaja, TablaVentasTurno } from '../components/TablasTurno'
import { sucursalesService } from '@/features/sucursales/services/sucursales.service'
import { useAuth } from '@/core/stores/auth.store'
import { useVentasEnCola } from '@/core/offline/cola-ventas.store'
import Skeleton from '@/shared/components/Skeleton'
import EstadoVacio from '@/shared/components/EstadoVacio'
import { formatoFecha } from '@/shared/utils/formato'

export default function MiCaja() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [sucursales, setSucursales] = useState([])

  const [abriendo, setAbriendo] = useState(false)
  const [conMovimiento, setConMovimiento] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const enCola = useVentasEnCola(auth.usuario?.id)

  const pedir = useCallback(() => {
    Promise.all([cajaService.turnoActual(), sucursalesService.listar()])
      .then(([actual, lista]) => {
        setSucursales(lista)
        if (!actual.turno) return null
        // Sin conexión solo se conoce el último arqueo guardado.
        if (actual.sin_conexion) return { ...actual, movimientos: [], ventas: [], sin_conexion: true }
        return cajaService.obtenerTurno(actual.turno.id)
      })
      .then((d) => {
        setDetalle(d)
        setError(null)
        setCargando(false)
      })
      .catch((e) => {
        setError(e.message)
        setCargando(false)
      })
  }, [])

  useEffect(() => {
    pedir()
  }, [pedir])

  const recargar = () => {
    setCargando(true)
    pedir()
  }

  if (cargando) return <Skeleton tipo="bloque" />

  if (error) {
    return (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <span className="material-symbols-outlined text-[40px] text-error">cloud_off</span>
        <p className="mt-2 font-semibold">No pudimos cargar tu caja</p>
        <p className="text-sm text-on-surface-variant">{error}</p>
        <button type="button" className="btn-secundario mt-4" onClick={recargar}>
          Reintentar
        </button>
      </div>
    )
  }

  if (!detalle) {
    return (
      <>
        <div className="mx-auto max-w-[900px]">
          <h1 className="mb-6 text-2xl font-semibold text-on-surface">Mi caja</h1>
          <div className="tarjeta">
            <EstadoVacio
              icono="point_of_sale"
              titulo="No tienes un turno abierto"
              descripcion="Abre un turno con el efectivo inicial de la caja para empezar a cobrar en el punto de venta."
              textoAccion="Abrir turno"
              onAccion={() => setAbriendo(true)}
            />
            <p className="pb-2 text-center text-sm">
              <Link to="/panel/turnos" className="text-primary hover:underline">
                Ver mis turnos anteriores
              </Link>
            </p>
          </div>
        </div>
        {abriendo && (
          <ModalAbrirTurno
            sucursales={sucursales}
            onCerrar={() => setAbriendo(false)}
            onAbierto={() => {
              setAbriendo(false)
              recargar()
            }}
          />
        )}
      </>
    )
  }

  const { turno, resumen, movimientos, ventas } = detalle
  const sinConexion = Boolean(detalle.sin_conexion)
  // Cerrar con ventas sin enviar dejaría el arqueo incompleto.
  const bloqueoCierre = sinConexion
    ? 'Sin conexión no se puede cerrar el turno.'
    : enCola.length > 0
      ? `Hay ${enCola.length} venta(s) de este equipo sin sincronizar: envíalas antes de cerrar.`
      : null

  return (
    <>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Turno abierto</p>
            <h1 className="text-3xl font-semibold text-on-surface">{numeroTurno(turno.id)}</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {turno.sucursal?.nombre} · desde {formatoFecha(turno.abierto_en, "d 'de' MMMM, HH:mm")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/panel/pos" className="btn-secundario">
              <span className="material-symbols-outlined text-[18px]">point_of_sale</span> Ir al punto de venta
            </Link>
            <button type="button" className="btn-secundario" disabled={sinConexion} onClick={() => setConMovimiento(true)}>
              <span className="material-symbols-outlined text-[18px]">swap_vert</span> Ingreso / egreso
            </button>
            <button
              type="button"
              className="btn-primario"
              disabled={Boolean(bloqueoCierre)}
              title={bloqueoCierre ?? undefined}
              onClick={() => setCerrando(true)}
            >
              <span className="material-symbols-outlined text-[18px]">lock</span> Cerrar turno y arquear
            </button>
          </div>
        </header>

        {bloqueoCierre && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
            <span className="material-symbols-outlined text-[18px]">cloud_off</span>
            <span className="flex-1">
              {bloqueoCierre}{' '}
              {sinConexion
                ? 'Este es el último arqueo guardado; puedes seguir cobrando en el punto de venta.'
                : 'Las ventas cobradas sin conexión todavía no están sumadas en este arqueo.'}
            </span>
            {enCola.length > 0 && (
              <Link to="/panel/sincronizacion" className="font-semibold underline">
                Ver ventas
              </Link>
            )}
          </div>
        )}

        <ResumenArqueo turno={turno} resumen={resumen} />

        <section className="tarjeta p-0">
          <h2 className="border-b border-outline-variant px-6 py-4 text-sm font-semibold text-on-surface">
            Movimientos de efectivo
          </h2>
          <TablaMovimientosCaja movimientos={movimientos} />
        </section>

        <section className="tarjeta p-0">
          <h2 className="border-b border-outline-variant px-6 py-4 text-sm font-semibold text-on-surface">
            Ventas cobradas en el turno
          </h2>
          <TablaVentasTurno ventas={ventas} conEnlace={auth.esAdmin} />
        </section>
      </div>

      {conMovimiento && (
        <ModalMovimientoCaja
          turnoId={turno.id}
          onCerrar={() => setConMovimiento(false)}
          onGuardado={() => {
            setConMovimiento(false)
            recargar()
          }}
        />
      )}

      {cerrando && (
        <ModalCerrarTurno
          turno={turno}
          resumen={resumen}
          onCerrar={() => setCerrando(false)}
          onCerrado={() => navigate(`/panel/turnos/${turno.id}`)}
        />
      )}
    </>
  )
}
