/**
 * Reportes con IA: la IA solo elige opciones de listas cerradas y el backend arma el SQL.
 * Se prueba el armado de la consulta contra la base real (con RLS) sin llamar a Gemini.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  ConsultaInvalida,
  LISTA_DIMENSIONES,
  LISTA_MEDIDAS,
  armarConsultaAMedida,
} from '../dist/commons/reportes/consulta-a-medida.js'
import { RAIZ_BACKEND, sqlComoApp, uno } from './entorno.mjs'

const idDeEmpresa = async (slug) => (await uno('SELECT id FROM empresas WHERE slug = $1', [slug])).id

describe('Reportes IA: consulta a medida (sin SQL de la IA)', () => {
  it('todas las dimensiones y medidas de la lista blanca generan SQL valido', async () => {
    const empresa = await idDeEmpresa('fashionstore')
    for (const dimension of LISTA_DIMENSIONES) {
      for (const medida of LISTA_MEDIDAS) {
        const { sql, parametros } = armarConsultaAMedida({ dimension, medida, limite: 5 })
        const filas = await sqlComoApp(empresa, sql, parametros)
        assert.ok(filas.length <= 5, `${dimension}/${medida}`)
      }
    }
  })

  it('con todos los filtros a la vez tambien funciona', async () => {
    const empresa = await idDeEmpresa('fashionstore')
    const { sql, parametros } = armarConsultaAMedida({
      dimension: 'color',
      medida: 'unidades',
      orden: 'asc',
      desde: '2020-01-01',
      hasta: '2030-12-31',
      sucursal_id: 1,
      categoria_id: 1,
      modelo_id: 1,
      color_id: 1,
      talla_id: 1,
      temporada_id: 1,
      metodo_pago: 'efectivo',
      tipo_venta: 'presencial',
      limite: 10,
    })
    await sqlComoApp(empresa, sql, parametros)
  })

  it('los valores viajan como parametros, nunca dentro del SQL', () => {
    const { sql, parametros } = armarConsultaAMedida({
      dimension: 'talla',
      medida: 'importe',
      desde: '2026-09-01',
      sucursal_id: 7,
      metodo_pago: 'qr',
    })
    assert.ok(!sql.includes('2026-09-01'))
    assert.ok(!sql.includes("'qr'"))
    assert.deepEqual(parametros.slice(0, 3), ['2026-09-01', null, 7])
    assert.equal(parametros[8], 'qr')
  })

  it('rechaza cualquier valor fuera de las listas (intentos de inyeccion)', () => {
    const base = { dimension: 'color', medida: 'importe' }
    const invalidas = [
      { ...base, dimension: 'usuarios.password' },
      { ...base, dimension: 'color; DROP TABLE ventas' },
      { ...base, medida: 'SUM(1)) FROM usuarios --' },
      { ...base, orden: 'desc; DELETE FROM ventas' },
      { ...base, desde: "2026-01-01' OR '1'='1" },
      { ...base, sucursal_id: '1 OR 1=1' },
      { ...base, sucursal_id: -3 },
      { ...base, metodo_pago: "efectivo' OR 1=1 --" },
      { ...base, tipo_venta: 'mayorista' },
      { ...base, limite: 0 },
      { dimension: 'color' },
    ]
    for (const consulta of invalidas) {
      assert.throws(() => armarConsultaAMedida(consulta), ConsultaInvalida, JSON.stringify(consulta))
    }
  })

  it('cada empresa ve solo sus datos (RLS): Urban Wear no ve sucursales de FashionStore', async () => {
    const urban = await idDeEmpresa('urban-wear')
    const { sql, parametros } = armarConsultaAMedida({ dimension: 'sucursal', medida: 'ventas' })
    const filas = await sqlComoApp(urban, sql, parametros)
    const propias = (await sqlComoApp(urban, 'SELECT nombre FROM sucursales')).map((s) => s.nombre)
    for (const fila of filas) assert.ok(propias.includes(fila.Sucursal), fila.Sucursal)
  })

  it('ya no existe ningun camino que ejecute SQL escrito por la IA', () => {
    const servicio = readFileSync(join(RAIZ_BACKEND, 'src/services/ia.service.ts'), 'utf8')
    const repositorio = readFileSync(join(RAIZ_BACKEND, 'src/repositories/reportes.repository.ts'), 'utf8')
    assert.ok(!/consultaLibre|reporteLibre/.test(servicio + repositorio))
    // La IA no recibe el esquema de la base ni devuelve SQL al cliente.
    assert.ok(!/CREATE TABLE|usuarios\(id|sql:\s*\{\s*type/.test(servicio))
    assert.ok(!/\bsql: reporte\.sql/.test(servicio))
  })
})
