import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FashionStore SaaS: varias empresas (tenants) en una sola base PostgreSQL,
 * con aislamiento logico por `empresa_id` y Row Level Security.
 *
 * - Toda tabla de negocio recibe `empresa_id`. Su valor por defecto es la
 *   empresa de la sesion (`app.empresa_id`), asi los INSERT existentes no
 *   cambian: la fila queda en la empresa de quien la crea.
 * - Una politica RLS por tabla deja ver y escribir solo filas de esa empresa,
 *   salvo en modo plataforma (`app.plataforma = on`, superadmin).
 * - FORCE ROW LEVEL SECURITY y el rol `fs_app` (sin superusuario) hacen que la
 *   politica se aplique tambien al usuario dueno de las tablas.
 * - Los datos que ya existian pasan a la empresa 1 ("FashionStore").
 */

const ROL_APP = 'fs_app';

/** Tablas cuyas filas pertenecen a una empresa. */
const TABLAS_DE_EMPRESA = [
  'roles',
  'usuarios',
  'ciudades',
  'categorias',
  'colecciones',
  'colores',
  'talla',
  'temporadas',
  'proveedores',
  'sucursales',
  'trabajador',
  'promociones',
  'modelos',
  'productos',
  'producto_sucursal',
  'turnos_caja',
  'movimientos_caja',
  'ventas',
  'detalle_venta',
  'comprobantes',
  'envios',
  'envio_eventos',
  'reserva',
  'reserva_sucursal',
  'almacenes',
  'producto_almacen',
  'movimientos_almacen',
  'detalle_movimiento_almacen',
  'bitacora',
  'sync_eliminados',
];

/**
 * Filas que pueden no tener empresa: el superadmin de la plataforma y su rol.
 * Solo se ven en modo plataforma.
 */
const EMPRESA_OPCIONAL = new Set(['roles', 'usuarios']);

/** Unicos globales que pasan a ser unicos dentro de cada empresa. */
const UNICOS_POR_EMPRESA = [
  { tabla: 'roles', columna: 'nombre', viejo: 'roles_nombre_key', tipo: 'constraint' },
  { tabla: 'ciudades', columna: 'nombre', viejo: 'ciudades_nombre_key', tipo: 'constraint' },
  { tabla: 'categorias', columna: 'nombre', viejo: 'categorias_nombre_key', tipo: 'constraint' },
  { tabla: 'colecciones', columna: 'nombre', viejo: 'colecciones_nombre_key', tipo: 'constraint' },
  { tabla: 'colores', columna: 'nombre', viejo: 'colores_nombre_key', tipo: 'constraint' },
  { tabla: 'talla', columna: 'nombre', viejo: 'talla_nombre_key', tipo: 'constraint' },
  { tabla: 'temporadas', columna: 'nombre', viejo: 'temporadas_nombre_key', tipo: 'constraint' },
  { tabla: 'almacenes', columna: 'nombre', viejo: 'almacenes_nombre_key', tipo: 'constraint' },
  { tabla: 'trabajador', columna: 'codigo', viejo: 'ix_trabajador_codigo', tipo: 'index' },
  { tabla: 'productos', columna: 'sku', viejo: 'ux_productos_sku', tipo: 'index' },
] as const;

export class MultiEmpresa1759600000000 implements MigrationInterface {
  name = 'MultiEmpresa1759600000000';

  async up(q: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- rol app
    await q.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_APP}') THEN
           CREATE ROLE ${ROL_APP} NOLOGIN NOSUPERUSER NOBYPASSRLS;
         END IF;
       END $$`,
    );
    // El usuario de conexion tiene que poder hacer SET ROLE fs_app.
    await q.query(`GRANT ${ROL_APP} TO CURRENT_USER`);

    // ------------------------------------------------- funciones de contexto
    await q.query(
      `CREATE OR REPLACE FUNCTION fs_empresa_actual() RETURNS integer
         LANGUAGE sql STABLE AS
       $$ SELECT NULLIF(current_setting('app.empresa_id', true), '')::integer $$`,
    );
    await q.query(
      `CREATE OR REPLACE FUNCTION fs_es_plataforma() RETURNS boolean
         LANGUAGE sql STABLE AS
       $$ SELECT coalesce(current_setting('app.plataforma', true), '') = 'on' $$`,
    );

    // ------------------------------------------------- planes y empresas
    await q.query(
      `CREATE TABLE IF NOT EXISTS planes (
         id SERIAL PRIMARY KEY,
         codigo VARCHAR(30) NOT NULL UNIQUE,
         nombre VARCHAR(60) NOT NULL,
         descripcion VARCHAR(255),
         precio_mensual NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (precio_mensual >= 0),
         max_sucursales INTEGER NOT NULL CHECK (max_sucursales >= 1),
         gestion_productos BOOLEAN NOT NULL DEFAULT true,
         gestion_ventas BOOLEAN NOT NULL DEFAULT true,
         reservas BOOLEAN NOT NULL DEFAULT true,
         operacion_offline BOOLEAN NOT NULL DEFAULT true,
         reportes_convencionales BOOLEAN NOT NULL DEFAULT true,
         reportes_ia BOOLEAN NOT NULL DEFAULT false,
         activo BOOLEAN NOT NULL DEFAULT true
       )`,
    );
    await q.query(
      `INSERT INTO planes (codigo, nombre, descripcion, precio_mensual, max_sucursales, reportes_ia)
       VALUES
         ('basico', 'Básico', 'Para tiendas que empiezan: hasta 2 sucursales.', 150, 2, false),
         ('profesional', 'Profesional', 'Cadenas en crecimiento: hasta 10 sucursales y reportes con IA.', 450, 10, true)
       ON CONFLICT (codigo) DO NOTHING`,
    );

    await q.query(
      `CREATE TABLE IF NOT EXISTS empresas (
         id SERIAL PRIMARY KEY,
         nombre VARCHAR(120) NOT NULL,
         slug VARCHAR(60) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
         nit VARCHAR(30),
         correo VARCHAR(150),
         telefono VARCHAR(30),
         estado VARCHAR(20) NOT NULL DEFAULT 'activa'
           CHECK (estado IN ('activa', 'suspendida')),
         creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    await q.query(
      `CREATE TABLE IF NOT EXISTS suscripciones (
         id SERIAL PRIMARY KEY,
         empresa_id INTEGER NOT NULL DEFAULT fs_empresa_actual()
           REFERENCES empresas (id) ON DELETE CASCADE,
         plan_id INTEGER NOT NULL REFERENCES planes (id),
         fecha_inicio DATE NOT NULL,
         fecha_vencimiento DATE NOT NULL,
         estado VARCHAR(20) NOT NULL DEFAULT 'activa'
           CHECK (estado IN ('activa', 'reemplazada', 'cancelada', 'suspendida')),
         observacion VARCHAR(255),
         creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
         CHECK (fecha_vencimiento >= fecha_inicio)
       )`,
    );
    // Una sola suscripcion vigente por empresa; las anteriores quedan de historial.
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_suscripciones_vigente
         ON suscripciones (empresa_id) WHERE estado = 'activa'`,
    );

    // Lo que ya existia es la empresa 1, con plan Profesional por un anio.
    await q.query(
      `INSERT INTO empresas (id, nombre, slug, correo)
       VALUES (1, 'FashionStore', 'fashionstore', 'admin@tienda.com')
       ON CONFLICT (id) DO NOTHING`,
    );
    await q.query(
      `SELECT setval(pg_get_serial_sequence('empresas', 'id'),
                     GREATEST((SELECT max(id) FROM empresas), 1))`,
    );
    await q.query(
      `INSERT INTO suscripciones (empresa_id, plan_id, fecha_inicio, fecha_vencimiento, observacion)
       SELECT 1, id, current_date, current_date + 365, 'Migracion: empresa original'
         FROM planes WHERE codigo = 'profesional'
          AND NOT EXISTS (SELECT 1 FROM suscripciones WHERE empresa_id = 1)`,
    );

    // ------------------------------------------- empresa_id en cada tabla
    for (const tabla of TABLAS_DE_EMPRESA) {
      await q.query(
        `ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS empresa_id INTEGER
           REFERENCES empresas (id) ON DELETE CASCADE`,
      );
      await q.query(`UPDATE ${tabla} SET empresa_id = 1 WHERE empresa_id IS NULL`);
      await q.query(
        `ALTER TABLE ${tabla} ALTER COLUMN empresa_id SET DEFAULT fs_empresa_actual()`,
      );
      if (!EMPRESA_OPCIONAL.has(tabla)) {
        await q.query(`ALTER TABLE ${tabla} ALTER COLUMN empresa_id SET NOT NULL`);
      }
      await q.query(
        `CREATE INDEX IF NOT EXISTS ix_${tabla}_empresa ON ${tabla} (empresa_id)`,
      );
    }

    // Rol del superadmin: sin empresa, solo visible en modo plataforma.
    await q.query(
      `INSERT INTO roles (nombre, empresa_id)
       SELECT 'superadmin', NULL
        WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = 'superadmin' AND empresa_id IS NULL)`,
    );

    // ------------------------------------------ unicos dentro de cada empresa
    for (const { tabla, columna, viejo, tipo } of UNICOS_POR_EMPRESA) {
      if (tipo === 'constraint') {
        await q.query(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS ${viejo}`);
      } else {
        await q.query(`DROP INDEX IF EXISTS ${viejo}`);
      }
      await q.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ux_${tabla}_${columna}_empresa
           ON ${tabla} (empresa_id, ${columna})`,
      );
    }

    // La papelera de sincronizacion guarda la empresa de la fila borrada (no
    // la de la sesion: un borrado en modo plataforma no tiene empresa).
    await q.query(
      `CREATE OR REPLACE FUNCTION sync_registrar_eliminado() RETURNS trigger AS $$
       BEGIN
         INSERT INTO sync_eliminados (tabla, registro_id, usuario_id, empresa_id)
         VALUES (TG_TABLE_NAME, OLD.id,
                 (to_jsonb(OLD) ->> 'usuario_id')::integer,
                 (to_jsonb(OLD) ->> 'empresa_id')::integer);
         RETURN OLD;
       END
       $$ LANGUAGE plpgsql`,
    );

    // -------------------------------------------------------------- RLS
    for (const tabla of [...TABLAS_DE_EMPRESA, 'suscripciones']) {
      await q.query(`ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY`);
      await q.query(`ALTER TABLE ${tabla} FORCE ROW LEVEL SECURITY`);
      await q.query(`DROP POLICY IF EXISTS aislamiento_empresa ON ${tabla}`);
      await q.query(
        `CREATE POLICY aislamiento_empresa ON ${tabla}
           USING (fs_es_plataforma() OR empresa_id = fs_empresa_actual())
           WITH CHECK (fs_es_plataforma() OR empresa_id = fs_empresa_actual())`,
      );
    }
    // La empresa solo ve (y edita) su propia ficha.
    await q.query(`ALTER TABLE empresas ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE empresas FORCE ROW LEVEL SECURITY`);
    await q.query(`DROP POLICY IF EXISTS aislamiento_empresa ON empresas`);
    await q.query(
      `CREATE POLICY aislamiento_empresa ON empresas
         USING (fs_es_plataforma() OR id = fs_empresa_actual())
         WITH CHECK (fs_es_plataforma())`,
    );
    // planes: catalogo comun de la plataforma, sin RLS (se edita solo desde
    // los endpoints del superadmin).

    // ----------------------------------------------------------- permisos
    await q.query(`GRANT USAGE ON SCHEMA public TO ${ROL_APP}`);
    await q.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL_APP}`,
    );
    await q.query(`REVOKE ALL ON TABLE migrations FROM ${ROL_APP}`);
    await q.query(
      `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ROL_APP}`,
    );
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROL_APP}`,
    );
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${ROL_APP}`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${ROL_APP}`,
    );
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM ${ROL_APP}`,
    );

    for (const tabla of [...TABLAS_DE_EMPRESA, 'suscripciones', 'empresas']) {
      await q.query(`DROP POLICY IF EXISTS aislamiento_empresa ON ${tabla}`);
      await q.query(`ALTER TABLE ${tabla} NO FORCE ROW LEVEL SECURITY`);
      await q.query(`ALTER TABLE ${tabla} DISABLE ROW LEVEL SECURITY`);
    }

    await q.query(
      `CREATE OR REPLACE FUNCTION sync_registrar_eliminado() RETURNS trigger AS $$
       BEGIN
         INSERT INTO sync_eliminados (tabla, registro_id, usuario_id)
         VALUES (TG_TABLE_NAME, OLD.id, (to_jsonb(OLD) ->> 'usuario_id')::integer);
         RETURN OLD;
       END
       $$ LANGUAGE plpgsql`,
    );

    // Volver a una sola empresa: se descarta todo lo que no es de la empresa 1.
    await q.query(`DELETE FROM usuarios WHERE empresa_id IS DISTINCT FROM 1`);
    await q.query(`DELETE FROM roles WHERE empresa_id IS DISTINCT FROM 1`);
    await q.query(`DELETE FROM empresas WHERE id <> 1`);

    for (const { tabla, columna, viejo, tipo } of UNICOS_POR_EMPRESA) {
      await q.query(`DROP INDEX IF EXISTS ux_${tabla}_${columna}_empresa`);
      if (tipo === 'constraint') {
        await q.query(`ALTER TABLE ${tabla} ADD CONSTRAINT ${viejo} UNIQUE (${columna})`);
      } else {
        await q.query(`CREATE UNIQUE INDEX ${viejo} ON ${tabla} (${columna})`);
      }
    }

    for (const tabla of TABLAS_DE_EMPRESA) {
      await q.query(`ALTER TABLE ${tabla} DROP COLUMN IF EXISTS empresa_id`);
    }

    await q.query(`DROP TABLE IF EXISTS suscripciones`);
    await q.query(`DROP TABLE IF EXISTS empresas`);
    await q.query(`DROP TABLE IF EXISTS planes`);
    await q.query(`DROP FUNCTION IF EXISTS fs_es_plataforma()`);
    await q.query(`DROP FUNCTION IF EXISTS fs_empresa_actual()`);
    await q.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROL_APP}`);
    await q.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ROL_APP}`);
    await q.query(`REVOKE USAGE ON SCHEMA public FROM ${ROL_APP}`);
  }
}
