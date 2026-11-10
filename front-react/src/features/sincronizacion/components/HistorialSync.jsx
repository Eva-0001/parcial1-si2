import { useEffect } from 'react'
import { useHistorialStore } from '@/core/offline/historial'
import { formatoFecha } from '@/shared/utils/formato'
import { cx } from '@/shared/utils/clases'

const RESULTADOS = {
  confirmada: { texto: 'Confirmada', clase: 'bg-green-100 text-green-800' },
  rechazada: { texto: 'Rechazada', clase: 'bg-error/10 text-error' },
  conflicto: { texto: 'Conflicto de stock', clase: 'bg-amber-100 text-amber-900' },
  descartada: { texto: 'Descartada', clase: 'bg-surface-container text-on-surface-variant' },
}
const TIPOS = { venta: 'Venta', reserva: 'Reserva', pedido: 'Pedido' }

/** Lo que pasó con cada operación hecha sin conexión en este equipo (las más recientes primero). */
export default function HistorialSync({ usuarioId }) {
  const registros = useHistorialStore((s) => s.registros)
  const cargar = useHistorialStore((s) => s.cargar)

  useEffect(() => {
    cargar()
  }, [cargar])

  const propios = registros.filter((r) => r.usuario_id === usuarioId).slice(0, 50)

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-on-surface">Historial de este equipo</h2>
      <p className="mb-3 text-sm text-on-surface-variant">
        Resultado final de cada operación hecha sin conexión. Las confirmadas salen de la cola pero quedan registradas
        aquí.
      </p>
      <div className="tabla overflow-x-auto rounded-xl border border-outline-variant">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Operación</th>
              <th>Resultado</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {propios.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-on-surface-variant">
                  Todavía no se sincronizó nada desde este equipo.
                </td>
              </tr>
            ) : (
              propios.map((r) => {
                const res = RESULTADOS[r.resultado] ?? RESULTADOS.rechazada
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatoFecha(r.fecha, 'dd/MM/yyyy HH:mm')}</td>
                    <td>{TIPOS[r.tipo] ?? r.tipo}</td>
                    <td>{r.descripcion}</td>
                    <td>
                      <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', res.clase)}>
                        {res.texto}
                      </span>
                    </td>
                    <td className="text-xs text-on-surface-variant">
                      {r.servidor_id ? `#${r.servidor_id}` : ''}
                      {r.servidor_id && r.mensaje ? ' · ' : ''}
                      {r.mensaje ?? ''}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
