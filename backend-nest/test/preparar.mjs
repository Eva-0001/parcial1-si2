/**
 * Preparacion global de las pruebas de integracion (node --test-global-setup):
 * crea la base de prueba, aplica migraciones, siembra las dos empresas de
 * prueba y levanta la API compilada. Al terminar, la detiene y borra la base.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { API, CLAVE_ADMIN, CLAVE_DEMO, PUERTO_API, RAIZ_BACKEND, URL_ADMIN, URL_BASE_PRUEBA } from './entorno.mjs'

let api = null
let carpetaUploads = null

async function admin(consulta) {
  const cliente = new pg.Client({ connectionString: URL_ADMIN })
  await cliente.connect()
  try {
    await cliente.query(consulta)
  } finally {
    await cliente.end()
  }
}

function entorno() {
  return {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: URL_BASE_PRUEBA,
    PORT: String(PUERTO_API),
    JWT_SECRET: 'secreto-de-pruebas',
    ADMIN_USERNAME: 'admin',
    ADMIN_CORREO: 'admin@tienda.com',
    ADMIN_PASSWORD: CLAVE_ADMIN,
    SEED_PASSWORD: CLAVE_DEMO,
    SEED_DEMO: 'true',
    PLATAFORMA_PASSWORD: CLAVE_DEMO,
    UPLOAD_DIR: carpetaUploads,
    // Las pruebas no llaman a servicios externos.
    GEMINI_API_KEY: '',
    IA_HABILITADA: 'false',
    STRIPE_SECRET_KEY: '',
  }
}

function correr(script) {
  const r = spawnSync(process.execPath, [script], { cwd: RAIZ_BACKEND, env: entorno(), encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${script} fallo:\n${r.stdout}\n${r.stderr}`)
}

export async function globalSetup() {
  carpetaUploads = mkdtempSync(join(tmpdir(), 'fs-test-uploads-'))
  await admin('DROP DATABASE IF EXISTS tiendavr_test WITH (FORCE)')
  await admin('CREATE DATABASE tiendavr_test')
  correr('dist/database/run-migrations.js')
  correr('dist/database/seeds/seed.js')

  api = spawn(process.execPath, ['dist/main.js'], { cwd: RAIZ_BACKEND, env: entorno(), stdio: ['ignore', 'ignore', 'pipe'] })
  let errores = ''
  api.stderr.on('data', (d) => (errores += d))
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${API}/planes`)).ok) return
    } catch {
      // todavia arrancando
    }
    if (api.exitCode !== null) throw new Error(`La API no arranco:\n${errores}`)
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`La API no respondio en ${API}:\n${errores}`)
}

export async function globalTeardown() {
  api?.kill()
  await new Promise((r) => setTimeout(r, 500))
  await admin('DROP DATABASE IF EXISTS tiendavr_test WITH (FORCE)').catch(() => {})
  if (carpetaUploads) rmSync(carpetaUploads, { recursive: true, force: true })
}
