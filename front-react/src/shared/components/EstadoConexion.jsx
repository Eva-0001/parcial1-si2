import { Link } from 'react-router'
import { useConexionStore } from '@/core/offline/conexion.store'
import { useColaVentasStore, useVentasEnCola } from '@/core/offline/cola-ventas.store'
import { useColaReservasStore, useReservasEnCola } from '@/core/offline/cola-reservas.store'
import { aplicarActualizacion } from '@/core/offline/registrar-sw'
import { useAuth } from '@/core/stores/auth.store'
import { cx } from '../utils/clases'

/** Aviso flotante: sin conexión, ventas por sincronizar o versión nueva de la app. */
export default function EstadoConexion() {
  const auth = useAuth()
  const enLinea = useConexionStore((s) => s.enLinea)
  const actualizacion = useConexionStore((s) => s.actualizacion)
  const sincronizandoVentas = useColaVentasStore((s) => s.sincronizando)
  const sincronizandoReservas = useColaReservasStore((s) => s.sincronizando)
  const sincronizando = sincronizandoVentas || sincronizandoReservas
  const ventasEnCola = useVentasEnCola(auth.usuario?.id)
  const reservasEnCola = useReservasEnCola(auth.usuario?.id)
  const enCola = [...ventasEnCola, ...reservasEnCola]

  const sincronizar = () => {
    useColaVentasStore.getState().sincronizar()
    useColaReservasStore.getState().sincronizar()
  }

  const pendientes = ventasEnCola.filter((v) => v.estado === 'pendiente').length
  const reservasEnEspera = reservasEnCola.filter((r) => r.estado === 'pendiente').length
  const conError = enCola.length - pendientes - reservasEnEspera
  const esPersonal = auth.tieneRol('administrador', 'cajero')
  // Las ventas se revisan en el panel; las reservas, en "Mis reservas".
  const destino = ventasEnCola.length > 0 ? (esPersonal ? '/panel/sincronizacion' : null) : '/reservas'

  if (enLinea && enCola.length === 0 && !actualizacion) return null

  return (
    <div className="no-imprimir fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col gap-2">
      {actualizacion && (
        <div className="flex items-center gap-3 rounded-xl bg-on-surface px-4 py-3 text-sm text-surface shadow-xl">
          <span className="material-symbols-outlined text-[20px]">system_update</span>
          <span className="flex-1">Hay una versión nueva de la aplicación.</span>
          <button type="button" className="font-semibold underline" onClick={aplicarActualizacion}>
            Actualizar
          </button>
        </div>
      )}

      {(!enLinea || enCola.length > 0) && (
        <div
          role="status"
          className={cx(
            'flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-xl',
            enLinea ? 'bg-surface-container-lowest text-on-surface ring-1 ring-outline-variant' : 'bg-amber-100 text-amber-900',
          )}
        >
          <span className={cx('material-symbols-outlined text-[20px]', sincronizando && 'animate-spin')}>
            {sincronizando ? 'progress_activity' : enLinea ? 'cloud_sync' : 'cloud_off'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {enLinea ? (sincronizando ? 'Sincronizando...' : 'Conexión restablecida') : 'Sin conexión'}
            </p>
            <p className="text-xs opacity-80">
              {!enLinea && 'Ves los datos guardados; lo que registres se guarda y se envía solo al volver la conexión. '}
              {pendientes > 0 && `${pendientes} ${pendientes === 1 ? 'venta pendiente' : 'ventas pendientes'}. `}
              {reservasEnEspera > 0 &&
                `${reservasEnEspera} ${reservasEnEspera === 1 ? 'reserva en espera' : 'reservas en espera'}. `}
              {conError > 0 && `${conError} con error para revisar.`}
            </p>
          </div>
          {enLinea && pendientes + reservasEnEspera > 0 && !sincronizando && (
            <button type="button" className="text-xs font-semibold underline" onClick={() => sincronizar()}>
              Sincronizar
            </button>
          )}
          {destino && enCola.length > 0 && (
            <Link to={destino} className="text-xs font-semibold underline">
              Ver
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
