import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/core/stores/auth.store'
import { toast } from '@/core/stores/toast.store'
import GraficoBarras from '@/shared/components/GraficoBarras'
import GraficoSeries from '@/shared/components/GraficoSeries'
import Skeleton from '@/shared/components/Skeleton'
import { cx } from '@/shared/utils/clases'
import { analiticaService } from '../services/analitica.service'

const COLOR_REAL = '#4f46e5'
const COLOR_PREDICHO = '#d97706'

const numero = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })
/** Métricas con coma decimal (igual que el resto de los números de la página). */
const metrica = (v, decimales = 2) =>
  new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(v)
const bs = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const fecha = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-BO', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : ''
/** "2026-11-02" -> "02/11" */
const semanaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function Tile({ etiqueta, valor, detalle }) {
  return (
    <div className="tarjeta">
      <p className="text-xs text-on-surface-variant">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-on-surface">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-on-surface-variant">{detalle}</p>}
    </div>
  )
}

function Seccion({ icono, titulo, children }) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
        <span className="material-symbols-outlined text-primary">{icono}</span>
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Interpretacion({ children }) {
  return (
    <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-on-surface">
      <span className="material-symbols-outlined text-[20px] text-primary">lightbulb</span>
      <div>{children}</div>
    </div>
  )
}

function Tabla({ encabezados, filas, numericas = [] }) {
  return (
    <div className="tabla overflow-x-auto rounded-xl border border-outline-variant">
      <table>
        <thead>
          <tr>
            {encabezados.map((h, i) => (
              <th key={h} className={cx(numericas.includes(i) && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={encabezados.length} className="py-6 text-center text-sm text-on-surface-variant">
                Sin datos.
              </td>
            </tr>
          ) : (
            filas.map((f, i) => (
              <tr key={i}>
                {f.map((c, j) => (
                  <td key={j} className={cx(numericas.includes(j) && 'text-right tabular-nums')}>
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function Analitica() {
  const { esAdmin } = useAuth()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [entrenando, setEntrenando] = useState(null)
  const [verTablaSerie, setVerTablaSerie] = useState(false)

  const pedir = useCallback(() => {
    analiticaService
      .resumen()
      .then(setDatos)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    pedir()
  }, [pedir])

  const entrenar = async (regenerar) => {
    setEntrenando(regenerar ? 'regenerar' : 'entrenar')
    try {
      setDatos(await analiticaService.entrenar(regenerar))
      toast.exito('Modelos entrenados')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setEntrenando(null)
    }
  }

  if (error) {
    return (
      <div className="tarjeta mx-auto max-w-[1200px] py-16 text-center">
        <p className="text-on-surface">No pudimos cargar la analítica</p>
        <p className="mt-1 text-sm text-on-surface-variant">{error}</p>
      </div>
    )
  }
  if (!datos) return <Skeleton tipo="tarjetas" cantidad={4} />

  const { demanda, segmentos, anomalias, datos: info, historial } = datos
  const botones = esAdmin && (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-primario" onClick={() => entrenar(false)} disabled={entrenando !== null}>
        <span className="material-symbols-outlined text-[18px]">model_training</span>
        {entrenando === 'entrenar' ? 'Entrenando...' : 'Entrenar modelos'}
      </button>
      <button type="button" className="btn-secundario" onClick={() => entrenar(true)} disabled={entrenando !== null}>
        <span className="material-symbols-outlined text-[18px]">autorenew</span>
        {entrenando === 'regenerar' ? 'Generando...' : 'Regenerar datos y entrenar'}
      </button>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1200px] space-y-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Analítica inteligente</h1>
          {demanda && (
            <p className="mt-1 text-sm text-on-surface-variant">
              Último entrenamiento: {fecha(demanda.entrenado_en)}
            </p>
          )}
        </div>
        {botones}
      </div>

      {entrenando && (
        <div className="tarjeta flex items-center gap-3 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          Entrenando modelos...
        </div>
      )}

      {!demanda || !segmentos ? (
        <div className="tarjeta py-16 text-center">
          <span className="material-symbols-outlined text-[48px] text-primary/40">model_training</span>
          <h2 className="mt-2 text-lg font-semibold text-on-surface">Todavía no hay modelos entrenados</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {esAdmin
              ? 'Pulsa "Entrenar modelos".'
              : 'Pídele al administrador que entrene los modelos.'}
          </p>
        </div>
      ) : (
        <>
          <Seccion icono="database" titulo="Datos de entrenamiento">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Tile
                etiqueta="Semanas de historia"
                valor={info.semanas}
                detalle={`${semanaCorta(info.desde)}/${info.desde.slice(0, 4)} al ${semanaCorta(info.hasta)}/${info.hasta.slice(0, 4)}`}
              />
              <Tile etiqueta="Filas" valor={numero.format(info.filas)} />
              <Tile
                etiqueta="Prendas en el historial"
                valor={numero.format(info.unidades)}
                detalle={`${numero.format(info.unidades_reales)} de ventas reales`}
              />
              <Tile etiqueta="Clientes sintéticos" valor={info.clientes_sinteticos} />
            </div>
          </Seccion>

          <SeccionDemanda demanda={demanda} verTabla={verTablaSerie} setVerTabla={setVerTablaSerie} />
          <SeccionSegmentos segmentos={segmentos} />
          <SeccionAnomalias anomalias={anomalias} />

          <Seccion icono="history" titulo="Historial de entrenamientos">
            <Tabla
              encabezados={['Fecha', 'Modelo', 'Versión', 'Filas entrenamiento', 'Filas prueba', 'Métrica principal']}
              numericas={[2, 3, 4]}
              filas={historial.map((h) => [
                fecha(h.entrenado_en),
                h.algoritmo,
                h.version,
                h.filas_entrenamiento,
                h.filas_prueba,
                h.tipo === 'demanda'
                  ? `R² ${metrica(h.metricas.r2, 3)} · MAE ${metrica(h.metricas.mae)}`
                  : `k = ${h.metricas.k_elegido} · silhouette ${metrica(h.metricas.silhouette, 3)}`,
              ])}
            />
          </Seccion>
        </>
      )}
    </div>
  )
}

function SeccionDemanda({ demanda, verTabla, setVerTabla }) {
  const m = demanda.metricas
  const r = demanda.resultados

  // Eje X: semanas de prueba + semanas pronosticadas.
  const prueba = r.prueba
  const pronostico = r.pronostico_total
  const etiquetas = [...prueba.map((p) => semanaCorta(p.semana)), ...pronostico.map((p) => semanaCorta(p.semana))]
  const vacio = (n) => Array.from({ length: n }, () => null)
  const series = [
    {
      nombre: 'Ventas reales',
      color: COLOR_REAL,
      valores: [...prueba.map((p) => p.real), ...vacio(pronostico.length)],
    },
    {
      nombre: 'Predicción del modelo',
      color: COLOR_PREDICHO,
      valores: [...prueba.map((p) => p.predicho), ...vacio(pronostico.length)],
    },
    {
      nombre: 'Pronóstico próximas semanas',
      color: COLOR_PREDICHO,
      punteada: true,
      valores: [
        ...vacio(prueba.length - 1),
        prueba[prueba.length - 1]?.predicho ?? null,
        ...pronostico.map((p) => p.unidades),
      ],
    },
  ]

  const aReponer = r.reposicion.filter((x) => x.sugerido > 0)

  return (
    <Seccion icono="trending_up" titulo="Predicción de demanda · Random Forest">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile etiqueta="R² en prueba" valor={metrica(m.r2, 3)} detalle={`Referencia: ${metrica(m.referencia_r2, 3)}`} />
        <Tile
          etiqueta="Error medio (MAE)"
          valor={`± ${metrica(m.mae)}`}
          detalle={`Referencia: ± ${metrica(m.referencia_mae)}`}
        />
        <Tile etiqueta="RMSE" valor={metrica(m.rmse)} detalle={`Referencia: ${metrica(m.referencia_rmse)}`} />
        <Tile
          etiqueta="Mejora frente a la referencia"
          valor={`${m.mejora_mae_pct > 0 ? '−' : '+'}${metrica(Math.abs(m.mejora_mae_pct), 1)} %`}
        />
      </div>

      <div className="tarjeta">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-on-surface">Ventas semanales: reales, predichas y pronóstico</h3>
          <button
            type="button"
            className="text-xs font-semibold text-primary hover:underline"
            onClick={() => setVerTabla(!verTabla)}
          >
            {verTabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        </div>
        {verTabla ? (
          <Tabla
            encabezados={['Semana', 'Real', 'Predicho']}
            numericas={[1, 2]}
            filas={[
              ...prueba.map((p) => [semanaCorta(p.semana), p.real, numero.format(p.predicho)]),
              ...pronostico.map((p) => [`${semanaCorta(p.semana)} (pronóstico)`, '—', numero.format(p.unidades)]),
            ]}
          />
        ) : (
          <GraficoSeries etiquetas={etiquetas} series={series} formato={(v) => numero.format(Math.round(v))} />
        )}
      </div>

      <div className="tarjeta">
        <h3 className="mb-3 font-semibold text-on-surface">Importancia de cada variable</h3>
        <GraficoBarras
          datos={r.importancia.map((i) => ({
            etiqueta: i.variable,
            valor: i.porcentaje,
          }))}
          formato={(v) => `${metrica(v, 1)} %`}
        />
      </div>
      <div className="tarjeta">
        <h3 className="mb-3 font-semibold text-on-surface">Reposición sugerida</h3>
        {aReponer.length === 0 && (
          <p className="mb-3 text-xs text-on-surface-variant">No hace falta reponer ninguna categoría.</p>
        )}
        <Tabla
          encabezados={['Sucursal', 'Categoría', 'Demanda', 'Stock', 'Cobertura', 'Reponer']}
          numericas={[2, 3, 4, 5]}
          filas={r.reposicion.slice(0, 12).map((x) => [
            x.sucursal,
            x.categoria,
            x.demanda_2_semanas,
            x.stock_disponible,
            x.cobertura_semanas == null ? '—' : `${numero.format(x.cobertura_semanas)} sem.`,
            x.sugerido > 0 ? (
              <strong key="s" className="text-error">
                {x.sugerido}
              </strong>
            ) : (
              0
            ),
          ])}
        />
      </div>

      <details className="tarjeta">
        <summary className="cursor-pointer font-semibold text-on-surface">Pronóstico por sucursal y categoría</summary>
        <div className="mt-3">
          <Tabla
            encabezados={[
              'Sucursal',
              'Categoría',
              ...(r.pronostico[0]?.semanas.map((s) => `Sem. ${semanaCorta(s.semana)}`) ?? []),
            ]}
            numericas={[2, 3, 4, 5]}
            filas={r.pronostico.map((p) => [p.sucursal, p.categoria, ...p.semanas.map((s) => Math.round(s.unidades))])}
          />
        </div>
      </details>
    </Seccion>
  )
}

function SeccionSegmentos({ segmentos }) {
  const m = segmentos.metricas
  const r = segmentos.resultados
  const [verTodos, setVerTodos] = useState(false)
  const clientes = verTodos ? r.clientes_reales : r.clientes_reales.slice(0, 10)

  return (
    <Seccion icono="groups" titulo="Segmentación de clientes · K-means">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile etiqueta="Grupos elegidos (k)" valor={m.k_elegido} />
        <Tile etiqueta="Silhouette" valor={metrica(m.silhouette, 3)} />
        <Tile etiqueta="Clientes reales segmentados" valor={m.clientes_reales} />
        <Tile etiqueta="Clientes sintéticos" valor={m.clientes_sinteticos} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="tarjeta">
          <h3 className="mb-3 font-semibold text-on-surface">Elección de k</h3>
          <Tabla
            encabezados={['k', 'Silhouette', 'Inercia']}
            numericas={[0, 1, 2]}
            filas={r.curva.map((c) => [
              c.k === m.k_elegido ? <strong key="k">{c.k} ✓</strong> : c.k,
              metrica(c.silhouette, 3),
              numero.format(c.inercia),
            ])}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          {r.segmentos.map((s) => (
            <article key={s.grupo} className="tarjeta">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-on-surface">{s.nombre}</h3>
                <span className="text-sm font-semibold tabular-nums text-primary">{s.clientes} clientes</span>
              </div>
              <p className="mt-1 text-xs text-on-surface-variant">
                {s.clientes_reales} reales · última compra hace {s.recencia_promedio} días ·{' '}
                {numero.format(s.frecuencia_promedio)} compras · Bs {bs.format(s.monto_promedio)} gastados en promedio
              </p>
              <p className="mt-2 text-sm text-on-surface">{s.recomendacion}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="tarjeta">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-on-surface">Clientes reales y su segmento</h3>
          {r.clientes_reales.length > 10 && (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline"
              onClick={() => setVerTodos(!verTodos)}
            >
              {verTodos ? 'Ver menos' : `Ver los ${r.clientes_reales.length}`}
            </button>
          )}
        </div>
        <Tabla
          encabezados={['Cliente', 'Segmento', 'Días desde la última compra', 'Compras', 'Gasto (Bs)']}
          numericas={[2, 3, 4]}
          filas={clientes.map((c) => [c.nombre, c.segmento, c.recencia_dias, c.frecuencia, bs.format(c.monto)])}
        />
      </div>
    </Seccion>
  )
}

function SeccionAnomalias({ anomalias }) {
  return (
    <Seccion icono="crisis_alert" titulo="Ventas atípicas">
      {anomalias.ventas.length === 0 ? (
        <Interpretacion>
          No se detectaron ventas atípicas
          {anomalias.limite_superior != null &&
            `: todas están por debajo de Bs ${bs.format(anomalias.limite_superior)}`}
          .
        </Interpretacion>
      ) : (
        <Tabla
          encabezados={['Venta', 'Fecha', 'Cliente', 'Tipo', 'Total (Bs)']}
          numericas={[4]}
          filas={anomalias.ventas.map((v) => [`#${v.id}`, v.fecha, v.cliente, v.tipo_venta, bs.format(v.total)])}
        />
      )}
    </Seccion>
  )
}
