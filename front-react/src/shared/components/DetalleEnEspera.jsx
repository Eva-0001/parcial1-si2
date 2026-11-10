import { formatoFecha } from '@/shared/utils/formato'

/** Prendas de una reserva o pedido en espera (lo que se guardó en el equipo al hacerla). */
export default function DetalleEnEspera({ items, creadaEn }) {
  return (
    <div className="border-t border-amber-200 bg-surface-container-lowest/70 px-4 py-2">
      <ul className="divide-y divide-outline-variant">
        {items.map((i, n) => (
          <li key={n} className="flex items-center gap-3 py-2 text-sm">
            <span className="material-symbols-outlined text-[20px] text-primary/50">checkroom</span>
            <div className="flex-1">
              <p className="font-semibold text-on-surface">{i.nombre}</p>
              <p className="text-xs text-on-surface-variant">
                {[i.talla && `Talla ${i.talla}`, i.color].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="font-semibold tabular-nums">x{i.cantidad}</span>
          </li>
        ))}
      </ul>
      {creadaEn && (
        <p className="py-2 text-xs text-on-surface-variant">
          Guardado sin conexión el {formatoFecha(creadaEn, 'dd/MM/yyyy HH:mm')}
        </p>
      )}
    </div>
  )
}
