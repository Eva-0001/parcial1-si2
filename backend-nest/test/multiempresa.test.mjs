/**
 * Aislamiento entre empresas (RNF02) y plataforma SaaS: un usuario de la
 * Empresa A no puede consultar, modificar ni borrar datos de la Empresa B, y
 * la restriccion vive en el backend (RLS), no en la interfaz.
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { pedir, sql, sqlComoApp, token, uno } from './entorno.mjs'

describe('Aislamiento entre empresas', () => {
  let A, B, ventaDeA, sucursalDeA

  before(async () => {
    A = await token('admin') // FashionStore
    B = await token('admin.urban') // Urban Wear
    ventaDeA = (await uno(`SELECT id FROM ventas WHERE empresa_id = 1 ORDER BY id LIMIT 1`)).id
    sucursalDeA = (await uno(`SELECT id FROM sucursales WHERE empresa_id = 1 ORDER BY id LIMIT 1`)).id
  })

  it('cada empresa ve solo sus ventas', async () => {
    const a = await pedir('GET', '/ventas', { token: A })
    const b = await pedir('GET', '/ventas', { token: B })
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    const idsA = new Set(a.cuerpo.map((v) => v.id))
    assert.ok(b.cuerpo.every((v) => !idsA.has(v.id)), 'B no debe recibir ventas de A')
  })

  it('la Empresa B no puede leer una venta de A por su id (404)', async () => {
    const r = await pedir('GET', `/ventas/${ventaDeA}`, { token: B })
    assert.equal(r.status, 404)
  })

  it('la Empresa B no puede modificar ni borrar una sucursal de A', async () => {
    const editar = await pedir('PUT', `/sucursales/${sucursalDeA}`, { token: B, cuerpo: { nombre: 'Hackeada' } })
    const borrar = await pedir('DELETE', `/sucursales/${sucursalDeA}`, { token: B })
    assert.equal(editar.status, 404)
    assert.equal(borrar.status, 404)
    const fila = await uno(`SELECT nombre FROM sucursales WHERE id = $1`, [sucursalDeA])
    assert.notEqual(fila.nombre, 'Hackeada')
  })

  it('la cabecera X-Empresa no permite saltar a otra empresa: manda el token', async () => {
    const r = await pedir('GET', '/usuarios', { token: B, cabeceras: { 'X-Empresa': 'fashionstore' } })
    assert.equal(r.status, 200)
    const empresas = new Set(r.cuerpo.map((u) => u.empresa_id))
    assert.deepEqual([...empresas], [2])
  })

  it('el catalogo publico depende de la tienda pedida', async () => {
    const a = await pedir('GET', '/sucursales', { cabeceras: { 'X-Empresa': 'fashionstore' } })
    const b = await pedir('GET', '/sucursales', { cabeceras: { 'X-Empresa': 'urban-wear' } })
    assert.ok(a.cuerpo.length > 0 && b.cuerpo.length > 0)
    const idsA = new Set(a.cuerpo.map((s) => s.id))
    assert.ok(b.cuerpo.every((s) => !idsA.has(s.id)))
  })

  it('un usuario de A no entra por la tienda de B', async () => {
    const r = await pedir('POST', '/auth/login', {
      cuerpo: { username: 'admin', password: 'admin123' },
      cabeceras: { 'X-Empresa': 'urban-wear' },
    })
    assert.equal(r.status, 401)
  })

  it('RLS en la base: sin empresa en la sesion no se ve ninguna fila', async () => {
    // Aunque una consulta olvide filtrar por empresa, PostgreSQL no devuelve nada.
    const [{ n }] = await sqlComoApp(null, `SELECT count(*)::int AS n FROM ventas`)
    assert.equal(n, 0)
  })

  it('RLS en la base: con la Empresa 2 solo se ven filas de la Empresa 2', async () => {
    const filas = await sqlComoApp(2, `SELECT DISTINCT empresa_id FROM productos`)
    assert.deepEqual(filas.map((f) => f.empresa_id), [2])
  })

  it('RLS en la base: no se puede escribir una fila para otra empresa', async () => {
    await assert.rejects(
      sqlComoApp(2, `INSERT INTO categorias (nombre, empresa_id) VALUES ('Intrusa', 1)`),
      /row-level security/,
    )
    const total = await sql(`SELECT count(*)::int AS n FROM categorias WHERE nombre = 'Intrusa'`)
    assert.equal(total[0].n, 0)
  })
})

describe('Plataforma SaaS', () => {
  it('el superadmin administra empresas pero no opera tiendas', async () => {
    const S = await token('superadmin', 'demo1234')
    const empresas = await pedir('GET', '/plataforma/empresas', { token: S })
    assert.equal(empresas.status, 200)
    assert.ok(empresas.cuerpo.length >= 2)
    assert.equal((await pedir('GET', '/ventas', { token: S })).status, 403)
  })

  it('un administrador de empresa no entra a /plataforma', async () => {
    assert.equal((await pedir('GET', '/plataforma/empresas', { token: await token('admin') })).status, 403)
  })

  it('registrar una empresa crea su espacio de trabajo completo', async () => {
    const r = await pedir('POST', '/empresas/registro', {
      cuerpo: {
        nombre: 'Moda Test',
        slug: 'moda-test',
        plan: 'basico',
        ciudad: 'Sucre',
        sucursal: 'Tienda Centro',
        administrador: {
          nombre: 'Ana',
          apellido: 'Prueba',
          correo: 'ana@modatest.com',
          username: 'ana.modatest',
          password: 'secreto123',
        },
      },
    })
    assert.equal(r.status, 201)
    const t = r.cuerpo.access_token
    const sucursales = await pedir('GET', '/sucursales', { token: t })
    const roles = await pedir('GET', '/roles', { token: t })
    const productos = await pedir('GET', '/productos', { token: t })
    assert.deepEqual(sucursales.cuerpo.map((s) => s.nombre), ['Tienda Centro'])
    assert.ok(roles.cuerpo.some((x) => x.nombre === 'administrador'))
    assert.equal(productos.cuerpo.length, 0, 'nace sin productos de otras empresas')

    const repetida = await pedir('POST', '/empresas/registro', {
      cuerpo: { ...r.cuerpo.empresa, nombre: 'Otra', slug: 'moda-test', plan: 'basico', administrador: { nombre: 'X', apellido: 'Y', correo: 'x@y.com', username: 'xx.yy', password: 'secreto123' } },
    })
    assert.equal(repetida.status, 409)
  })
})
