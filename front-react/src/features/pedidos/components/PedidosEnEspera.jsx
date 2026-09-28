import { useAuth } from '@/core/stores/auth.store'
import { useColaPedidosStore, usePedidosEnCola } from '@/core/offline/cola-pedidos.store'
import { useConexionStore } from '@/core/offline/conexion.store'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'

const ETIQUETA_PAGO = { qr: 'Pago por QR', contraentrega: 'Contraentrega' }

/** Pedidos hechos sin conexión que todavía no llegaron al servidor. */
export default function PedidosEnEspera() {
  const auth = useAuth()
  const enCola = usePedidosEnCola(auth.usuario?.id)
  const enLinea = useConexionStore((s) => s.enLinea)
  const sincronizando = useColaPedidosStore((s) => s.sincronizando)
  const reintentar = useColaPedidosStore((s) => s.reintentar)
  const descartar = useColaPedidosStore((s) => s.descartar)

  if (enCola.length === 0) return null

  return (
    <section className="mb-6 space-y-3" aria-live="polite">
      {enCola.map((p) => {
        const conError = p.estado === 'error'
        const { resumen } = p
        const unidades = resumen.items.reduce((acc, i) => acc + i.cantidad, 0)
        return (
          <div
            key={p.id_cliente}
            className={cx(
              'flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center',
              conError ? 'border-error/40 bg-error/5' : 'border-amber-300 bg-amber-50',
            )}
          >
            <span
              className={cx(
                'material-symbols-outlined text-[28px]',
                conError ? 'text-error' : 'text-amber-600',
                !conError && sincronizando && 'animate-spin',
              )}
            >
              {conError ? 'error' : sincronizando ? 'progress_activity' : 'schedule_send'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-on-surface">
                {conError
                  ? 'No pudimos registrar este pedido'
                  : sincronizando
                    ? 'Enviando tu pedido...'
                    : 'Pedido en espera de conexión'}
              </p>
              <p className="text-sm text-on-surface-variant">
                {monedaBs(resumen.total)} · {ETIQUETA_PAGO[p.payload.metodo_pago]} ·{' '}
                {resumen.modalidad === 'domicilio' ? `Envío a ${resumen.direccion}` : `Retiro en ${resumen.sucursal}`} ·{' '}
                {unidades} {unidades === 1 ? 'prenda' : 'prendas'}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {conError
                  ? p.error
                  : enLinea
                    ? 'Ya hay conexión: se está enviando a la tienda.'
                    : `Está guardado en este equipo${p.comprobante ? ' junto con tu comprobante' : ''} y se enviará solo cuando vuelva la conexión. Te avisaremos al registrarse.`}
              </p>
            </div>
            {conError && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secundario py-1.5"
                  disabled={!enLinea}
                  onClick={() => reintentar(p.id_cliente)}
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  className="btn-icono-peligro"
                  title="Descartar"
                  onClick={() => descartar(p.id_cliente)}
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
