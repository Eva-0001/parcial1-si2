import { useCallback, useEffect, useState } from 'react'
import { http, limpiarParams } from '@/core/api/http'
import { cx } from '@/shared/utils/clases'

const RESULTADOS = {
  confirmada: { texto: 'Confirmada', clase: 'bg-green-100 text-green-800' },
  duplicada: { texto: 'Duplicada', clase: 'bg-surface-container text-on-surface-variant' },
  rechazada: { texto: 'Rechazada', clase: 'bg-error/10 text-error' },
  conflicto: { texto: 'Conflicto', clase: 'bg-amber-100 text-amber-800' },
  error: { texto: 'Error', clase: 'bg-error/10 text-error' },
}

const fecha = (iso) => new Date(iso).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'medium' })

/**
 * Registro del servidor de cada operación recibida por sincronización por lote
 * (de la web y de los teléfonos): quién la mandó, desde qué dispositivo, en qué
 * intento y qué pasó. Sirve para diagnosticar operaciones que fallaron.
 */
export default function RegistroServidor() {
  const [filtro, setFiltro] = useState('')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const pedir = useCallback(() => {
    http
      .get('/sync/registro', { params: limpiarParams({ resultado: filtro }) })
      .then(setDatos)
      .catch((e) => setError(e.message))
  }, [filtro])

  useEffect(() => {
    pedir()
  }, [pedir])

  const conteo = Object.fromEntries((datos?.ultimos_7_dias ?? []).map((f) => [f.resultado, f.operaciones]))

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Registro del servidor</h2>
          <p className="text-sm text-on-surface-variant">
            Operaciones recibidas por sincronización (web y teléfonos). Últimos 7 días:{' '}
            {Object.keys(RESULTADOS)
              .map((r) => `${conteo[r] ?? 0} ${RESULTADOS[r].texto.toLowerCase()}`)
              .join(' · ')}
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="campo w-44 py-2 text-sm"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            aria-label="Filtrar por resultado"
          >
            <option value="">Todos los resultados</option>
            {Object.entries(RESULTADOS).map(([valor, r]) => (
              <option key={valor} value={valor}>
                {r.texto}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secundario py-2" onClick={pedir}>
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <div className="tabla overflow-x-auto rounded-xl border border-outline-variant">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Usuario</th>
                <th>Sucursal</th>
                <th>Dispositivo</th>
                <th className="text-right">Intento</th>
                <th>Resultado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {(datos?.operaciones ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-on-surface-variant">
                    {datos ? 'Sin operaciones registradas.' : 'Cargando...'}
                  </td>
                </tr>
              ) : (
                datos.operaciones.map((o) => {
                  const r = RESULTADOS[o.resultado] ?? RESULTADOS.error
                  return (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap">{fecha(o.creado_en)}</td>
                      <td className="capitalize">{o.tipo}</td>
                      <td>{o.usuario ? `@${o.usuario}` : '—'}</td>
                      <td>{o.sucursal ?? '—'}</td>
                      <td className="text-xs">{o.dispositivo ?? '—'}</td>
                      <td className="text-right tabular-nums">{o.intento}</td>
                      <td>
                        <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', r.clase)}>{r.texto}</span>
                      </td>
                      <td className="text-xs text-on-surface-variant" title={o.operacion_id}>
                        {o.servidor_id ? `#${o.servidor_id} · ` : ''}
                        {o.mensaje ?? ''}
                        {o.duracion_ms != null ? ` (${o.duracion_ms} ms)` : ''}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
