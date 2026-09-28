import type { MigrationInterface, QueryRunner } from 'typeorm';

// Ventas registradas sin conexion desde la web (PWA): el cliente genera un UUID
// para que reintentar la sincronizacion nunca duplique la venta.
export class VentasOffline1759200000000 implements MigrationInterface {
  name = 'VentasOffline1759200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS id_cliente UUID`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_ventas_id_cliente ON ventas (id_cliente)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_ventas_id_cliente`);
    await queryRunner.query(
      `ALTER TABLE ventas DROP COLUMN IF EXISTS id_cliente`,
    );
  }
}
