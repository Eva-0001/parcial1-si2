/**
 * Planes y suscripciones: limites configurables y funciones por plan,
 * aplicados en el backend.
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { pedir, sql, token, uno } from './entorno.mjs'

describe('Plan Basico (Urban Wear)', () => {
  let B
  before(async () => {
    B = await token('admin.urban')
  })

  it('no permite una tercera sucursal (limite del plan: 2)', async () => {
    const ciudad = await uno(`SELECT id FROM ciudades WHERE empresa_id = 2 LIMIT 1`)
    const r = await pedir('POST', '/sucursales', { token: B, cuerpo: { nombre: 'Tercera', ciudad_id: ciudad.id } })
    assert.equal(r.status, 403)
    assert.equal(r.cuerpo.codigo, 'LIMITE_DEL_PLAN')
  })

  it('no incluye reportes generativos con IA', async () => {
    const r = await pedir('POST', '/ia/reportes', { token: B, cuerpo: { pregunta: 'ventas por sucursal' } })
    assert.equal(r.status, 403)
    assert.equal(r.cuerpo.codigo, 'FUNCION_NO_INCLUIDA')
  })

  it('al pasar a Profesional se habilita la tercera sucursal; no se puede volver a Basico con 3', async () => {
    const cambio = await pedir('POST', '/empresa/suscripcion/cambiar-plan', { token: B, cuerpo: { plan: 'profesional' } })
    assert.equal(cambio.status, 200)
    assert.equal(cambio.cuerpo.plan.codigo, 'profesional')

    const ciudad = await uno(`SELECT id FROM ciudades WHERE empresa_id = 2 LIMIT 1`)
    const creada = await pedir('POST', '/sucursales', { token: B, cuerpo: { nombre: 'Tercera', ciudad_id: ciudad.id } })
    assert.equal(creada.status, 201)

    const bajar = await pedir('POST', '/empresa/suscripcion/cambiar-plan', { token: B, cuerpo: { plan: 'basico' } })
    assert.equal(bajar.status, 409)
    assert.equal(bajar.cuerpo.codigo, 'LIMITE_DEL_PLAN')

    // Se deja como estaba para el resto de las pruebas.
    await pedir('DELETE', `/sucursales/${creada.cuerpo.id}`, { token: B })
    await pedir('POST', '/empresa/suscripcion/cambiar-plan', { token: B, cuerpo: { plan: 'basico' } })
    const historial = await sql(`SELECT estado FROM suscripciones WHERE empresa_id = 2`)
    assert.equal(historial.filter((s) => s.estado === 'activa').length, 1, 'una sola suscripcion vigente')
  })
})

describe('Estado de la suscripcion', () => {
  async function empresaNueva(slug) {
    const r = await pedir('POST', '/empresas/registro', {
      cuerpo: {
        nombre: `Empresa ${slug}`,
        slug,
        plan: 'basico',
        administrador: {
          nombre: 'Prueba',
          apellido: slug,
          correo: `${slug}@prueba.com`,
          username: `adm.${slug}`,
          password: 'secreto123',
        },
      },
    })
    assert.equal(r.status, 201)
    return { token: r.cuerpo.access_token, id: r.cuerpo.empresa.id }
  }

  it('vencida: queda en solo lectura hasta renovar', async () => {
    const { token: T, id } = await empresaNueva('vencida-test')
    await sql(
      `UPDATE suscripciones SET fecha_inicio = current_date - 60, fecha_vencimiento = current_date - 1 WHERE empresa_id = $1`,
      [id],
    )
    assert.equal((await pedir('GET', '/sucursales', { token: T })).status, 200)
    const escribir = await pedir('POST', '/categorias', { token: T, cuerpo: { nombre: 'Nueva' } })
    assert.equal(escribir.status, 403)
    assert.equal(escribir.cuerpo.codigo, 'SUSCRIPCION_VENCIDA')

    const renovar = await pedir('POST', '/empresa/suscripcion/renovar', { token: T, cuerpo: { meses: 1 } })
    assert.equal(renovar.status, 200)
    assert.equal(renovar.cuerpo.estado, 'activa')
    assert.equal((await pedir('POST', '/categorias', { token: T, cuerpo: { nombre: 'Nueva' } })).status, 201)
  })

  it('suspendida por la plataforma: no puede operar', async () => {
    const { token: T, id } = await empresaNueva('suspendida-test')
    const S = await token('superadmin', 'demo1234')
    const r = await pedir('PATCH', `/plataforma/empresas/${id}/estado`, { token: S, cuerpo: { estado: 'suspendida' } })
    assert.equal(r.status, 200)
    const bloqueada = await pedir('GET', '/sucursales', { token: T })
    assert.equal(bloqueada.status, 403)
    assert.equal(bloqueada.cuerpo.codigo, 'EMPRESA_SUSPENDIDA')
  })
})
