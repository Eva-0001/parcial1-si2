/**
 * Entorno compartido de las pruebas de integracion: base PostgreSQL de prueba
 * (tiendavr_test, en el mismo servidor de Docker) y API levantada en un puerto
 * aparte. Las pruebas hablan con la API por HTTP, igual que la web y el movil.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

function leerEnv(archivo) {
  try {
    return Object.fromEntries(
      readFileSync(archivo, 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    )
  } catch {
    return {}
  }
}

const envDocker = leerEnv(join(RAIZ, '..', '.env'))
const usuarioPg = envDocker.POSTGRES_USER || 'postgres'
const clavePg = envDocker.POSTGRES_PASSWORD || 'postgres'
const puertoPg = envDocker.DB_PORT || '5435'

/** Base de prueba (se crea y se borra en cada corrida). */
export const URL_BASE_PRUEBA =
  process.env.TEST_DATABASE_URL ??
  `postgresql://${usuarioPg}:${encodeURIComponent(clavePg)}@localhost:${puertoPg}/tiendavr_test`

/** Base de administracion del mismo servidor, para crear y borrar la de prueba. */
export const URL_ADMIN = URL_BASE_PRUEBA.replace(/\/[^/?]+(\?.*)?$/, '/postgres')

export const PUERTO_API = Number(process.env.TEST_API_PORT ?? 3999)
export const API = `http://localhost:${PUERTO_API}`
export const RAIZ_BACKEND = RAIZ

export const CLAVE_ADMIN = 'admin123'
export const CLAVE_DEMO = 'demo1234'

/** Consulta directa a la base de prueba como superusuario (para preparar e inspeccionar). */
export async function sql(consulta, parametros = []) {
  const cliente = new pg.Client({ connectionString: URL_BASE_PRUEBA })
  await cliente.connect()
  try {
    return (await cliente.query(consulta, parametros)).rows
  } finally {
    await cliente.end()
  }
}

/**
 * Consulta como la app: rol fs_app (sin superusuario) y la empresa indicada
 * en la sesion (null = ninguna). Sirve para probar RLS directamente en la base.
 */
export async function sqlComoApp(empresaId, consulta, parametros = []) {
  const cliente = new pg.Client({ connectionString: URL_BASE_PRUEBA })
  await cliente.connect()
  try {
    await cliente.query('BEGIN')
    await cliente.query('SET LOCAL ROLE fs_app')
    await cliente.query(`SELECT set_config('app.empresa_id', $1, true)`, [empresaId === null ? '' : String(empresaId)])
    const filas = (await cliente.query(consulta, parametros)).rows
    await cliente.query('COMMIT')
    return filas
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await cliente.end()
  }
}

export async function uno(consulta, parametros = []) {
  return (await sql(consulta, parametros))[0] ?? null
}

/** Peticion a la API. Devuelve { status, cuerpo }. */
export async function pedir(metodo, ruta, { cuerpo, token, cabeceras = {} } = {}) {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...cabeceras,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  const texto = await respuesta.text()
  let datos = null
  try {
    datos = texto ? JSON.parse(texto) : null
  } catch {
    datos = texto
  }
  return { status: respuesta.status, cuerpo: datos }
}

const tokens = new Map()

/** Token de un usuario del seed (se reutiliza dentro del mismo archivo de pruebas). */
export async function token(username, password = username.startsWith('admin') ? CLAVE_ADMIN : CLAVE_DEMO) {
  if (!tokens.has(username)) {
    const { status, cuerpo } = await pedir('POST', '/auth/login', { cuerpo: { username, password } })
    if (status !== 200) throw new Error(`No se pudo entrar como ${username}: ${status} ${JSON.stringify(cuerpo)}`)
    tokens.set(username, cuerpo.access_token)
  }
  return tokens.get(username)
}

/** Sucursal del trabajador (cajero o encargado) en el seed. */
export async function sucursalDe(username) {
  const fila = await uno(
    `SELECT t.sucursal_id FROM trabajador t JOIN usuarios u ON u.id = t.id WHERE u.username = $1`,
    [username],
  )
  return fila.sucursal_id
}
