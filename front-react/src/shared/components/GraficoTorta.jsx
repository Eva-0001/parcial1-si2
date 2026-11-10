import { useState } from 'react'
import { cx } from '../utils/clases'
import { partesDeTorta } from '../utils/torta'

/**
 * Torta (anillo) para participaciones: cada parte de un total.
 *
 * Colores en orden fijo, validados con el validador de paletas (separación para
 * daltonismo entre porciones vecinas, incluida la última con la primera). Tres de
 * ellos tienen poco contraste con el fondo blanco, así que la identidad nunca va
 * solo por color: cada porción tiene su fila en la leyenda con nombre, valor y %.
 * Con más de 6 partes, las menores se juntan en "Otros".
 */
const TAMANO = 200
const CENTRO = TAMANO / 2
const RADIO = 92
const RADIO_INTERNO = 58

const formatoPorDefecto = (v) => String(v)
const porcentaje = new Intl.NumberFormat('es-BO', { style: 'percent', maximumFractionDigits: 1 })

function punto(angulo, radio) {
  return [CENTRO + radio * Math.sin(angulo), CENTRO - radio * Math.cos(angulo)]
}

/** Porción de anillo entre dos ángulos (0 = arriba, en sentido horario). */
function arco(desde, hasta) {
  // Un arco SVG no puede cerrar el círculo completo: una sola parte se dibuja en dos mitades.
  if (hasta - desde >= Math.PI * 2 - 1e-6) {
    return `${arco(0, Math.PI)} ${arco(Math.PI, Math.PI * 2)}`
  }
  const grande = hasta - desde > Math.PI ? 1 : 0
  const [x1, y1] = punto(desde, RADIO)
  const [x2, y2] = punto(hasta, RADIO)
  const [x3, y3] = punto(hasta, RADIO_INTERNO)
  const [x4, y4] = punto(desde, RADIO_INTERNO)
  return [
    `M${x1.toFixed(2)},${y1.toFixed(2)}`,
    `A${RADIO},${RADIO} 0 ${grande} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
    `L${x3.toFixed(2)},${y3.toFixed(2)}`,
    `A${RADIO_INTERNO},${RADIO_INTERNO} 0 ${grande} 0 ${x4.toFixed(2)},${y4.toFixed(2)}`,
    'Z',
  ].join(' ')
}

export default function GraficoTorta({ datos, formato = formatoPorDefecto }) {
  const [activo, setActivo] = useState(null)
  const partes = partesDeTorta(datos)
  const total = partes.reduce((s, p) => s + p.valor, 0)

  if (partes.length === 0 || total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg bg-surface-container-low text-sm text-on-surface-variant">
        Sin datos
      </div>
    )
  }

  // Valor acumulado antes de cada parte: marca dónde empieza su porción.
  const inicios = partes.map((_, i) => partes.slice(0, i).reduce((s, p) => s + p.valor, 0))
  const angulo = (valor) => (valor / total) * Math.PI * 2
  const porciones = partes.map((p, i) => ({
    ...p,
    d: arco(angulo(inicios[i]), angulo(inicios[i] + p.valor)),
    parte: p.valor / total,
  }))
  const enFoco = activo === null ? null : porciones[activo]
  const resumen = porciones.map((p) => `${p.etiqueta} ${porcentaje.format(p.parte)}`).join(', ')

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-full max-w-[220px]">
        <svg viewBox={`0 0 ${TAMANO} ${TAMANO}`} className="w-full" role="img" aria-label={`Participación: ${resumen}`}>
          {porciones.map((p, i) => (
            <path
              key={p.etiqueta}
              d={p.d}
              fill={p.color}
              // Separación de 2 px del color del fondo entre porciones.
              stroke="var(--color-surface-container-lowest, #ffffff)"
              strokeWidth="2"
              strokeLinejoin="round"
              className="cursor-default transition-opacity duration-150"
              opacity={activo !== null && activo !== i ? 0.35 : 1}
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {enFoco ? (
            <>
              <span className="max-w-[110px] truncate text-xs text-on-surface-variant">{enFoco.etiqueta}</span>
              <span className="text-lg font-bold tabular-nums text-on-surface">{porcentaje.format(enFoco.parte)}</span>
              <span className="text-[11px] tabular-nums text-on-surface-variant">{formato(enFoco.valor)}</span>
            </>
          ) : (
            <>
              <span className="text-xs text-on-surface-variant">Total</span>
              <span className="text-base font-bold tabular-nums text-on-surface">{formato(total)}</span>
            </>
          )}
        </div>
      </div>

      <ul className="w-full space-y-1.5 text-xs" role="list">
        {porciones.map((p, i) => (
          <li
            key={p.etiqueta}
            className={cx(
              'flex items-center gap-2 rounded-md px-2 py-1 transition-colors',
              activo === i && 'bg-surface-container-low',
            )}
            onMouseEnter={() => setActivo(i)}
            onMouseLeave={() => setActivo(null)}
            title={p.detalle}
          >
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium text-on-surface">{p.etiqueta}</span>
            <span className="shrink-0 tabular-nums text-on-surface-variant">{formato(p.valor)}</span>
            <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-on-surface">
              {porcentaje.format(p.parte)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
