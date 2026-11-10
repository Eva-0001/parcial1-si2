import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cambios de prendas dentro de un plazo: el cliente devuelve una prenda de una
 * venta y se lleva otra (otra talla, otro color u otra prenda). Cada empresa
 * define cuantos dias tiene el cliente para cambiar (empresas.dias_para_cambios).
 */
const MOTIVOS_DE_CAMBIO = [
  'talla',
  'color',
  'defecto',
  'no_le_gusto',
  'otro',
] as const;

const TABLAS = ['cambios', 'detalle_cambio'];

export class CambiosDePrendas1759800000000 implements MigrationInterface {
  name = 'CambiosDePrendas1759800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dias_para_cambios INTEGER NOT NULL DEFAULT 15
         CHECK (dias_para_cambios BETWEEN 0 AND 365)`,
    );

    await q.query(
      `CREATE TABLE IF NOT EXISTS cambios (
         id SERIAL PRIMARY KEY,
         empresa_id INTEGER NOT NULL DEFAULT fs_empresa_actual()
           REFERENCES empresas (id) ON DELETE CASCADE,
         venta_id INTEGER NOT NULL REFERENCES ventas (id),
         sucursal_id INTEGER NOT NULL REFERENCES sucursales (id),
         usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
         motivo VARCHAR(20) NOT NULL
           CHECK (motivo IN (${MOTIVOS_DE_CAMBIO.map((m) => `'${m}'`).join(', ')})),
         observacion VARCHAR(255),
         total_devuelto NUMERIC(10, 2) NOT NULL,
         total_nuevo NUMERIC(10, 2) NOT NULL,
         diferencia NUMERIC(10, 2) NOT NULL,
         creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await q.query(`CREATE INDEX IF NOT EXISTS ix_cambios_venta ON cambios (venta_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS ix_cambios_empresa ON cambios (empresa_id, creada_en)`);

    await q.query(
      `CREATE TABLE IF NOT EXISTS detalle_cambio (
         id SERIAL PRIMARY KEY,
         empresa_id INTEGER NOT NULL DEFAULT fs_empresa_actual()
           REFERENCES empresas (id) ON DELETE CASCADE,
         cambio_id INTEGER NOT NULL REFERENCES cambios (id) ON DELETE CASCADE,
         detalle_venta_id INTEGER NOT NULL REFERENCES detalle_venta (id),
         stock_devuelto_id INTEGER NOT NULL REFERENCES producto_sucursal (id),
         stock_nuevo_id INTEGER NOT NULL REFERENCES producto_sucursal (id),
         cantidad INTEGER NOT NULL CHECK (cantidad > 0),
         precio_devuelto NUMERIC(10, 2) NOT NULL,
         precio_nuevo NUMERIC(10, 2) NOT NULL,
         CHECK (stock_devuelto_id <> stock_nuevo_id)
       )`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS ix_detalle_cambio_detalle ON detalle_cambio (detalle_venta_id)`,
    );

    for (const tabla of TABLAS) {
      await q.query(`ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY`);
      await q.query(`ALTER TABLE ${tabla} FORCE ROW LEVEL SECURITY`);
      await q.query(`DROP POLICY IF EXISTS aislamiento_empresa ON ${tabla}`);
      await q.query(
        `CREATE POLICY aislamiento_empresa ON ${tabla}
           USING (fs_es_plataforma() OR empresa_id = fs_empresa_actual())
           WITH CHECK (fs_es_plataforma() OR empresa_id = fs_empresa_actual())`,
      );
      await q.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tabla} TO fs_app`);
    }
    await q.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO fs_app`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS detalle_cambio`);
    await q.query(`DROP TABLE IF EXISTS cambios`);
    await q.query(`ALTER TABLE empresas DROP COLUMN IF EXISTS dias_para_cambios`);
  }
}
