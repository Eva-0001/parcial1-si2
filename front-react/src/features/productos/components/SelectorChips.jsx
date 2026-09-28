import { cx } from '@/shared/utils/clases'

/**
 * Selección múltiple con chips (colores o tallas para armar la matriz de variantes).
 * `onCambiar` recibe una función de actualización, como un setState.
 */
export default function SelectorChips({ opciones, seleccion, deshabilitadas = [], onCambiar }) {
  const alternar = (id) =>
    onCambiar((previa) => (previa.includes(id) ? previa.filter((x) => x !== id) : [...previa, id]))

  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const activa = seleccion.includes(o.id)
        const bloqueada = deshabilitadas.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            disabled={bloqueada}
            className={cx(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              activa
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary',
            )}
            onClick={() => alternar(o.id)}
          >
            {activa && <span className="material-symbols-outlined mr-0.5 align-middle text-[14px]">check</span>}
            {o.nombre}
          </button>
        )
      })}
    </div>
  )
}
