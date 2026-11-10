import { describirReserva, useColaReservasStore, useReservasEnCola } from '@/core/offline/cola-reservas.store'
import { useColaPedidosStore, usePedidosEnCola } from '@/core/offline/cola-pedidos.store'
import { useConexionStore } from '@/core/offline/conexion.store'
import { formatoFecha } from '@/shared/utils/formato'
import EstadoOperacion from './EstadoOperacion'

/** Reservas y pedidos en línea guardados en este equipo esperando conexión (o con error). */
export default function OtrasColas({ usuarioId }) {
  const enLinea = useConexionStore((s) => s.enLinea)
  const reservas = useReservasEnCola(usuarioId)
  const pedidos = usePedidosEnCola(usuarioId)
  const colaReservas = useColaReservasStore()
  const colaPedidos = useColaPedidosStore()

  const items = [
    ...reservas.map((r) => ({
      registro: r,
      tipo: 'Reserva',
      descripcion: describirReserva(r.resumen),
      enviando: colaReservas.enviando.includes(r.id_cliente),
      cola: colaReservas,
    })),
    ...pedidos.map((p) => ({
      registro: p,
      tipo: 'Pedido en línea',
      descripcion: p.resumen?.sucursal ?? 'Tienda',
      enviando: false,
      cola: colaPedidos,
    })),
  ].sort((a, b) => a.registro.creada_en.localeCompare(b.registro.creada_en))

  if (items.length === 0) return null

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-on-surface">Reservas y pedidos en cola</h2>
      <ul className="space-y-3">
        {items.map(({ registro, tipo, descripcion, enviando, cola }) => (
          <li key={registro.id_cliente} className="tarjeta flex flex-col gap-2 p-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-on-surface">
                {tipo} · {formatoFecha(registro.creada_en, 'dd/MM/yyyy HH:mm')}
                <EstadoOperacion registro={registro} enviando={enviando} />
              </p>
              <p className="text-xs text-on-surface-variant">{descripcion}</p>
              {registro.error && <p className="mt-1 text-sm text-error">{registro.error}</p>}
            </div>
            {registro.estado === 'error' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secundario py-1.5"
                  disabled={!enLinea}
                  onClick={() => cola.reintentar(registro.id_cliente)}
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  className="btn-icono-peligro"
                  title="Descartar"
                  onClick={() => cola.descartar(registro.id_cliente)}
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
