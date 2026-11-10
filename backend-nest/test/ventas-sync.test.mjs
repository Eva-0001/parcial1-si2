/**
 * Reglas criticas de ventas y sincronizacion offline: idempotencia (RNF05),
 * integridad transaccional del inventario (RNF04), resultados del lote y datos
 * obligatorios de la venta sin conexion (seccion 7.2), con conflicto de precio.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, describe, it } from 'node:test'
import { pedir, sql, sucursalDe, token, uno } from './entorno.mjs'

let C, sucursal, cliente

const stock = async (id) => (await uno(`SELECT cantidad FROM producto_sucursal WHERE id = $1`, [id])).cantidad
const ventaPresencial = (stockId, cantidad, extra = {}) => ({
  tipo_venta: 'presencial',
  usuario_id: cliente,
  metodo_pago: 'efectivo',
  detalles: [{ producto_sucursal_id: stockId, cantidad }],
  ...extra,
})
async function stockCon(minimo, maximo = 100000) {
  return uno(
    `SELECT id, cantidad - cantidad_reservada AS disponible FROM producto_sucursal
      WHERE sucursal_id = $1 AND cantidad - cantidad_reservada BETWEEN $2 AND $3 ORDER BY id LIMIT 1`,
    [sucursal, minimo, maximo],
  )
}

before(async () => {
  C = await token('lquispe') // cajero de FashionStore
  sucursal = await sucursalDe('lquispe')
  cliente = (await uno(`SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'cliente' AND u.empresa_id = 1 LIMIT 1`)).id
  const turno = await pedir('POST', '/caja/turnos', { token: C, cuerpo: { sucursal_id: sucursal, monto_inicial: '100.00' } })
  assert.ok([201, 409].includes(turno.status), `abrir turno: ${turno.status}`)
})

describe('Ventas', () => {
  it('reenviar la misma venta (mismo id_cliente) no la duplica', async () => {
    const s = await stockCon(3)
    const id_cliente = randomUUID()
    const antes = await stock(s.id)
    const primera = await pedir('POST', '/ventas', { token: C, cuerpo: ventaPresencial(s.id, 1, { id_cliente }) })
    const segunda = await pedir('POST', '/ventas', { token: C, cuerpo: ventaPresencial(s.id, 1, { id_cliente }) })
    assert.equal(primera.status, 201)
    assert.equal(segunda.cuerpo.id, primera.cuerpo.id)
    assert.equal((await uno(`SELECT count(*)::int AS n FROM ventas WHERE id_cliente = $1`, [id_cliente])).n, 1)
    assert.equal(await stock(s.id), antes - 1, 'el stock se descuenta una sola vez')
  })

  it('sin stock suficiente se rechaza y el inventario no cambia (rollback)', async () => {
    const s = await stockCon(1, 4)
    const antes = await stock(s.id)
    const r = await pedir('POST', '/ventas', { token: C, cuerpo: ventaPresencial(s.id, s.disponible + 5) })
    assert.equal(r.status, 409)
    assert.equal(await stock(s.id), antes)
  })

  it('una venta presencial descuenta el stock y queda en la bitacora', async () => {
    const s = await stockCon(2)
    const antes = await stock(s.id)
    const bitacoraAntes = (await uno(`SELECT count(*)::int AS n FROM bitacora`)).n
    const r = await pedir('POST', '/ventas', { token: C, cuerpo: ventaPresencial(s.id, 2) })
    assert.equal(r.status, 201)
    assert.equal(await stock(s.id), antes - 2)
    assert.ok((await uno(`SELECT count(*)::int AS n FROM bitacora`)).n > bitacoraAntes)
  })
})

describe('Sincronizacion por lote (POST /sync/push)', () => {
  it('devuelve el resultado de cada operacion y no duplica', async () => {
    const ok = await stockCon(3)
    const poco = await stockCon(1, 4)
    const ajeno = await uno(`SELECT id FROM producto_sucursal WHERE sucursal_id <> $1 AND empresa_id = 1 LIMIT 1`, [sucursal])
    const repetida = randomUUID()

    const r = await pedir('POST', '/sync/push', {
      token: C,
      cuerpo: {
        dispositivo: 'pruebas',
        operaciones: [
          { id: repetida, tipo: 'venta', sucursal_id: sucursal, empresa: 'fashionstore', datos: ventaPresencial(ok.id, 1) },
          { id: repetida, tipo: 'venta', sucursal_id: sucursal, datos: ventaPresencial(ok.id, 1), intento: 2 },
          { id: randomUUID(), tipo: 'venta', sucursal_id: sucursal, datos: ventaPresencial(poco.id, poco.disponible + 2) },
          { id: randomUUID(), tipo: 'venta', sucursal_id: sucursal, datos: ventaPresencial(ajeno.id, 1) },
          { id: randomUUID(), tipo: 'venta', sucursal_id: sucursal, empresa: 'urban-wear', datos: ventaPresencial(ok.id, 1) },
          { id: randomUUID(), tipo: 'reserva', sucursal_id: sucursal, datos: { fecha: '2030-01-10', hora: '11:00:00', usuario_id: cliente, detalles: [{ producto_sucursal_id: ok.id, cantidad: 1 }] } },
        ],
      },
    })
    assert.equal(r.status, 200)
    const resultados = r.cuerpo.resultados.map((x) => x.resultado)
    assert.deepEqual(resultados, ['confirmada', 'duplicada', 'conflicto', 'rechazada', 'rechazada', 'rechazada'])

    const conflicto = r.cuerpo.resultados[2].conflicto[0]
    assert.equal(conflicto.pedido, poco.disponible + 2)
    assert.equal(conflicto.disponible, poco.disponible)
    assert.match(r.cuerpo.resultados[5].mensaje, /rol/, 'un cajero no registra reservas')

    assert.equal((await uno(`SELECT count(*)::int AS n FROM ventas WHERE id_cliente = $1`, [repetida])).n, 1)
  })

  it('cada operacion queda en el registro del servidor, sin datos sensibles', async () => {
    const filas = await sql(`SELECT * FROM sync_log WHERE dispositivo = 'pruebas' ORDER BY id`)
    assert.equal(filas.length, 6)
    assert.ok(filas.every((f) => f.usuario_id && f.lote && f.duracion_ms !== null))
    const columnas = Object.keys(filas[0])
    assert.ok(!columnas.includes('datos') && !columnas.includes('total'), 'no guarda el contenido de la operacion')

    const admin = await pedir('GET', '/sync/registro', { token: await token('admin') })
    assert.equal(admin.status, 200)
    assert.equal((await pedir('GET', '/sync/registro', { token: C })).status, 403)
    const otraEmpresa = await pedir('GET', '/sync/registro', { token: await token('admin.urban') })
    assert.equal(otraEmpresa.cuerpo.operaciones.length, 0)
  })
})

describe('Datos de la venta sin conexion (7.2) y conflicto de precio', () => {
  let prenda
  const lote = (operaciones) => pedir('POST', '/sync/push', { token: C, cuerpo: { dispositivo: 'pruebas-7.2', operaciones } })
  const ventaOffline = (precio, cantidad = 1, extra = {}) => ({
    ...ventaPresencial(prenda.id, cantidad),
    registrada_en: new Date(Date.now() - 5 * 60_000).toISOString(),
    detalles: [{ producto_sucursal_id: prenda.id, cantidad, precio }],
    total: (Number(precio) * cantidad).toFixed(2),
    ...extra,
  })

  before(async () => {
    // Prenda sin precio por mayor: el precio vigente es el de lista de la sucursal.
    prenda = await uno(
      `SELECT ps.id, ps.precio::text AS precio FROM producto_sucursal ps JOIN productos p ON p.id = ps.producto_id
        WHERE ps.sucursal_id = $1 AND p.precio_mayor IS NULL AND ps.cantidad - ps.cantidad_reservada >= 5
        ORDER BY ps.id LIMIT 1`,
      [sucursal],
    )
  })

  it('guarda empresa, sucursal, responsable, cliente, hora real, precios, total, pago y origen', async () => {
    const id = randomUUID()
    const datos = ventaOffline(prenda.precio, 2)
    const r = await lote([{ id, tipo: 'venta', sucursal_id: sucursal, empresa: 'fashionstore', datos }])
    assert.equal(r.cuerpo.resultados[0].resultado, 'confirmada')

    const v = await uno(
      `SELECT v.empresa_id, v.usuario_id, v.metodo_pago::text, v.total::text, v.origen,
              v.registrada_en_dispositivo, v.sincronizada_en, t.cajero_id, t.sucursal_id,
              d.precio::text AS precio, d.precio_lista::text AS precio_lista, d.cantidad
         FROM ventas v JOIN turnos_caja t ON t.id = v.turno_id JOIN detalle_venta d ON d.venta_id = v.id
        WHERE v.id_cliente = $1`,
      [id],
    )
    const cajero = (await uno(`SELECT id FROM usuarios WHERE username = 'lquispe'`)).id
    assert.equal(v.empresa_id, 1)
    assert.equal(v.sucursal_id, sucursal)
    assert.equal(v.cajero_id, cajero, 'usuario responsable')
    assert.equal(v.usuario_id, cliente)
    assert.equal(v.metodo_pago, 'efectivo')
    assert.equal(v.origen, 'sin_conexion')
    assert.ok(v.registrada_en_dispositivo && v.sincronizada_en)
    assert.ok(v.sincronizada_en > v.registrada_en_dispositivo, 'se sincronizo despues de registrarse')
    assert.equal(v.precio, prenda.precio)
    assert.equal(v.cantidad, 2)
    assert.equal(Number(v.total), Number(datos.total))
  })

  it('si el precio cambio, queda en conflicto con el detalle y no toca el stock', async () => {
    const antes = await stock(prenda.id)
    const cobrado = (Number(prenda.precio) - 10).toFixed(2)
    const r = await lote([{ id: randomUUID(), tipo: 'venta', sucursal_id: sucursal, datos: ventaOffline(cobrado) }])
    const resultado = r.cuerpo.resultados[0]
    assert.equal(resultado.resultado, 'conflicto')
    assert.equal(resultado.codigo, 'PRECIO_CAMBIADO')
    assert.deepEqual(
      { cobrado: resultado.precios[0].cobrado, actual: resultado.precios[0].actual },
      { cobrado, actual: prenda.precio },
    )
    assert.equal(await stock(prenda.id), antes)
  })

  it('respetar el precio cobrado exige la autorizacion de un administrador o encargado', async () => {
    const id = randomUUID()
    const cobrado = (Number(prenda.precio) - 10).toFixed(2)
    const sin = await lote([{ id, tipo: 'venta', sucursal_id: sucursal, datos: ventaOffline(cobrado, 1, { respetar_precios: true }) }])
    assert.equal(sin.cuerpo.resultados[0].resultado, 'rechazada')
    assert.equal(sin.cuerpo.resultados[0].codigo_http, 403)

    const mala = await lote([
      { id, tipo: 'venta', sucursal_id: sucursal, datos: ventaOffline(cobrado, 1, { respetar_precios: true, autorizacion: { username: 'admin', password: 'otra' } }) },
    ])
    assert.equal(mala.cuerpo.resultados[0].resultado, 'rechazada')

    const ok = await lote([
      { id, tipo: 'venta', sucursal_id: sucursal, intento: 3, datos: ventaOffline(cobrado, 1, { respetar_precios: true, autorizacion: { username: 'admin', password: 'admin123' } }) },
    ])
    assert.equal(ok.cuerpo.resultados[0].resultado, 'confirmada')
    const v = await uno(
      `SELECT v.total::text, v.precios_autorizados_por, d.precio::text AS precio, d.precio_lista::text AS lista
         FROM ventas v JOIN detalle_venta d ON d.venta_id = v.id WHERE v.id_cliente = $1`,
      [id],
    )
    const admin = (await uno(`SELECT id FROM usuarios WHERE username = 'admin'`)).id
    assert.equal(v.precios_autorizados_por, admin)
    assert.equal(v.precio, cobrado, 'se respeta lo cobrado')
    assert.equal(v.lista, prenda.precio, 'y queda el precio de lista vigente para auditar')
    assert.equal(Number(v.total), Number(cobrado))
    // La contrasena no se guarda en ningun lado.
    const log = await sql(`SELECT mensaje FROM sync_log WHERE operacion_id = $1`, [id])
    assert.ok(log.every((f) => !String(f.mensaje ?? '').includes('admin123')))
  })

  it('un total que no cuadra con las prendas se rechaza', async () => {
    const r = await lote([
      { id: randomUUID(), tipo: 'venta', sucursal_id: sucursal, datos: ventaOffline(prenda.precio, 1, { total: '1.00' }) },
    ])
    assert.equal(r.cuerpo.resultados[0].resultado, 'rechazada')
    assert.equal(r.cuerpo.resultados[0].codigo, 'TOTAL_INCONSISTENTE')
  })

  it('la descarga incluye el precio por mayor para calcular igual que el servidor', async () => {
    const r = await pedir('GET', '/sync/tienda', { token: C })
    assert.equal(r.status, 200)
    assert.ok('precio_mayor' in r.cuerpo.prendas[0] && 'minimo_mayor' in r.cuerpo.prendas[0])
  })
})
