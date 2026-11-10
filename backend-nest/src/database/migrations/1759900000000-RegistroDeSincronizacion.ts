import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de cada operacion recibida por POST /sync/push (observabilidad):
 * quien la envio, desde que dispositivo, en que intento, y que paso. No se
 * guarda el contenido de la operacion (montos, clientes): solo lo necesario
 * para diagnosticar fallos.
 */
export class RegistroDeSincronizacion1759900000000 implements MigrationInterface {
  name = 'RegistroDeSincronizacion1759900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE IF NOT EXISTS sync_log (
         id BIGSERIAL PRIMARY KEY,
         empresa_id INTEGER NOT NULL DEFAULT fs_empresa_actual()
           REFERENCES empresas (id) ON DELETE CASCADE,
         lote UUID NOT NULL,
         operacion_id UUID NOT NULL,
         tipo VARCHAR(20) NOT NULL,
         usuario_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
         sucursal_id INTEGER,
         dispositivo VARCHAR(100),
         intento INTEGER NOT NULL DEFAULT 1,
         resultado VARCHAR(20) NOT NULL
           CHECK (resultado IN ('confirmada', 'duplicada', 'rechazada', 'conflicto', 'error')),
         codigo_http INTEGER,
         codigo_error VARCHAR(40),
         mensaje VARCHAR(255),
         servidor_id INTEGER,
         duracion_ms INTEGER,
         creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await q.query(`CREATE INDEX IF NOT EXISTS ix_sync_log_fecha ON sync_log (empresa_id, creado_en DESC)`);
    await q.query(`CREATE INDEX IF NOT EXISTS ix_sync_log_operacion ON sync_log (operacion_id)`);

    await q.query(`ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE sync_log FORCE ROW LEVEL SECURITY`);
    await q.query(`DROP POLICY IF EXISTS aislamiento_empresa ON sync_log`);
    await q.query(
      `CREATE POLICY aislamiento_empresa ON sync_log
         USING (fs_es_plataforma() OR empresa_id = fs_empresa_actual())
         WITH CHECK (fs_es_plataforma() OR empresa_id = fs_empresa_actual())`,
    );
    await q.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON sync_log TO fs_app`);
    await q.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO fs_app`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS sync_log`);
  }
}
