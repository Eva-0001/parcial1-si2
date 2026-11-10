import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modulo de analitica inteligente (Machine Learning), por empresa y con RLS:
 *  - ml_demanda_semanal: historial semanal de unidades vendidas por sucursal y
 *    categoria (datos sinteticos generados + ventas reales sumadas encima).
 *  - ml_clientes_sinteticos: clientes artificiales con perfiles de compra
 *    (recencia, frecuencia, monto) para entrenar la segmentacion.
 *  - ml_modelos: cada entrenamiento, con parametros, metricas y resultados.
 */
const TABLAS = ['ml_demanda_semanal', 'ml_clientes_sinteticos', 'ml_modelos'];

export class AnaliticaMl1759700000000 implements MigrationInterface {
  name = 'AnaliticaMl1759700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE IF NOT EXISTS ml_demanda_semanal (
         id BIGSERIAL PRIMARY KEY,
         empresa_id INTEGER NOT NULL DEFAULT fs_empresa_actual()
           REFERENCES empresas (id) ON DELETE CASCADE,
         semana DATE NOT NULL,
         sucursal_id INTEGER NOT NULL REFERENCES sucursales (id) ON DELETE CASCADE,
         categoria_id INTEGER NOT NULL REFERENCES categorias (id) ON DELETE CASCADE,
         unidades INTEGER NOT NULL CHECK (unidades >= 0),
         unidades_reales INTEGER NOT NULL DEFAULT 0 CHECK (unidades_reales >= 0),
         importe NUMERIC(12, 2) NOT NULL DEFAULT 0,
         promocion BOOLEAN NOT NULL DEFAULT false,
         CONSTRAINT uq_ml_demanda UNIQUE (empresa_id, semana, sucursal_id, categoria_id)
       )`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS ml_clientes_sinteticos (
         id BIGSERIAL PRIMARY KEY,
         empresa_id INTEGER NOT NULL DEFAULT fs_empresa_actual()
           REFERENCES empresas (id) ON DELETE CASCADE,
         codigo VARCHAR(20) NOT NULL,
         perfil VARCHAR(30) NOT NULL,
         recencia_dias INTEGER NOT NULL CHECK (recencia_dias >= 0),
         frecuencia INTEGER NOT NULL CHECK (frecuencia >= 1),
         monto NUMERIC(12, 2) NOT NULL CHECK (monto >= 0)
       )`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS ml_modelos (
         id SERIAL PRIMARY KEY,
         empresa_id INTEGER NOT NULL DEFAULT fs_empresa_actual()
           REFERENCES empresas (id) ON DELETE CASCADE,
         tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('demanda', 'segmentos')),
         version INTEGER NOT NULL,
         algoritmo VARCHAR(60) NOT NULL,
         entrenado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
         filas_entrenamiento INTEGER NOT NULL,
         filas_prueba INTEGER NOT NULL DEFAULT 0,
         parametros JSONB NOT NULL DEFAULT '{}',
         metricas JSONB NOT NULL DEFAULT '{}',
         resultados JSONB NOT NULL DEFAULT '{}',
         CONSTRAINT uq_ml_modelos_version UNIQUE (empresa_id, tipo, version)
       )`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS ix_ml_demanda_serie
         ON ml_demanda_semanal (empresa_id, sucursal_id, categoria_id, semana)`,
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
    for (const tabla of [...TABLAS].reverse()) {
      await q.query(`DROP TABLE IF EXISTS ${tabla}`);
    }
  }
}
