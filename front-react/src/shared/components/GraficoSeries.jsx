import { useRef, useState } from 'react'

const ANCHO = 720
const MARGEN = { arriba: 16, derecha: 16, abajo: 32, izquierda: 52 }
const formatoPorDefecto = (v) => String(Math.round(v))

function redondearArriba(v) {
  const magnitud = Math.pow(10, Math.floor(Math.log10(v)))
  const normalizado = v / magnitud
  const paso = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10
  return paso * magnitud
}

/**
 * Varias series de línea sobre un mismo eje X (etiquetas) y un solo eje Y.
 * Cada serie: { nombre, color, punteada?, valores: (number|null)[] } alineados
 * con `etiquetas`. Con `null` la serie no tiene dato en ese punto.
 * Leyenda arriba, cruz + tooltip con todas las series al pasar el mouse.
 */
export default function GraficoSeries({ etiquetas, series, formato = formatoPorDefecto, alto = 260 }) {
  const [activo, setActivo] = useState(null)
  const svgRef = useRef(null)

  const todos = series.flatMap((s) => s.valores.filter((v) => v != null))
  const max = Math.max(0, ...todos)
  const maximo = max === 0 ? 1 : redondearArriba(max)

  const n = etiquetas.length
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha
  const altoUtil = alto - MARGEN.arriba - MARGEN.abajo
  const xDe = (i) => MARGEN.izquierda + (n <= 1 ? anchoUtil / 2 : (i / (n - 1)) * anchoUtil)
  const yDe = (v) => MARGEN.arriba + altoUtil - (v / maximo) * altoUtil

  const trazoDe = (valores) => {
    let d = ''
    let abierto = false
    valores.forEach((v, i) => {
      if (v == null) {
        abierto = false
        return
      }
      d += `${abierto ? 'L' : 'M'}${xDe(i).toFixed(1)},${yDe(v).toFixed(1)} `
      abierto = true
    })
    return d.trim()
  }

  const grilla = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: yDe(maximo * f), valor: maximo * f }))
  const cadaCuantas = Math.max(1, Math.ceil(n / 8))

  const mover = (evento) => {
    const svg = svgRef.current
    if (!svg || n === 0) return
    const caja = svg.getBoundingClientRect()
    const x = ((evento.clientX - caja.left) / caja.width) * ANCHO
    const i = Math.round(((x - MARGEN.izquierda) / anchoUtil) * (n - 1))
    setActivo(Math.min(n - 1, Math.max(0, i)))
  }

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-4 text-xs text-on-surface-variant" aria-label="Leyenda">
        {series.map((s) => (
          <li key={s.nombre} className="flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden="true">
              <line
                x1="1"
                y1="4"
                x2="21"
                y2="4"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={s.punteada ? '4 3' : undefined}
              />
            </svg>
            {s.nombre}
          </li>
        ))}
      </ul>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${ANCHO} ${alto}`}
          className="w-full"
          role="img"
          aria-label={series.map((s) => s.nombre).join(', ')}
          onMouseMove={mover}
          onMouseLeave={() => setActivo(null)}
        >
          {grilla.map((g) => (
            <g key={g.y}>
              <line x1={MARGEN.izquierda} x2={ANCHO - MARGEN.derecha} y1={g.y} y2={g.y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={MARGEN.izquierda - 8} y={g.y + 4} textAnchor="end" fontSize="11" fill="#6b7280">
                {formato(g.valor)}
              </text>
            </g>
          ))}

          {etiquetas.map((e, i) =>
            i % cadaCuantas === 0 || i === n - 1 ? (
              <text key={e + i} x={xDe(i)} y={alto - 10} textAnchor="middle" fontSize="11" fill="#6b7280">
                {e}
              </text>
            ) : null,
          )}

          {activo !== null && (
            <line
              x1={xDe(activo)}
              x2={xDe(activo)}
              y1={MARGEN.arriba}
              y2={alto - MARGEN.abajo}
              stroke="#9ca3af"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {series.map((s) => (
            <path
              key={s.nombre}
              d={trazoDe(s.valores)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.punteada ? '6 4' : undefined}
            />
          ))}

          {activo !== null &&
            series.map((s) =>
              s.valores[activo] == null ? null : (
                <circle
                  key={s.nombre}
                  cx={xDe(activo)}
                  cy={yDe(s.valores[activo])}
                  r="4"
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              ),
            )}
        </svg>

        {activo !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs shadow-card"
            style={{
              left: `${(xDe(activo) / ANCHO) * 100}%`,
              transform: xDe(activo) > ANCHO / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            }}
          >
            <p className="mb-1 font-semibold text-on-surface">{etiquetas[activo]}</p>
            {series.map((s) =>
              s.valores[activo] == null ? null : (
                <p key={s.nombre} className="flex items-center justify-between gap-3 text-on-surface-variant">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }}></span>
                    {s.nombre}
                  </span>
                  <span className="font-semibold tabular-nums text-on-surface">{formato(s.valores[activo])}</span>
                </p>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
