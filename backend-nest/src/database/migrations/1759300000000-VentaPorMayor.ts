import type { MigrationInterface, QueryRunner } from 'typeorm';

// Precio por mayor por producto (con minimo de unidades surtidas), modalidad de la
// venta y precio de lista en cada linea para mostrar el descuento aplicado.
export class VentaPorMayor1759300000000 implements MigrationInterface {
  name = 'VentaPorMayor1759300000000';

  private readonly sentencias: string[] = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modalidad_venta_enum') THEN
         CREATE TYPE modalidad_venta_enum AS ENUM ('menor', 'mayor');
       END IF;
     END $$`,

    `ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_mayor NUMERIC(10, 2)`,
    `ALTER TABLE productos ADD COLUMN IF NOT EXISTS minimo_mayor INTEGER NOT NULL DEFAULT 6`,
    `ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_precio_mayor`,
    `ALTER TABLE productos ADD CONSTRAINT ck_productos_precio_mayor
       CHECK (precio_mayor IS NULL OR (precio_mayor > 0 AND precio_mayor < precio))`,
    `ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_minimo_mayor`,
    `ALTER TABLE productos ADD CONSTRAINT ck_productos_minimo_mayor CHECK (minimo_mayor >= 2)`,

    `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS modalidad modalidad_venta_enum NOT NULL DEFAULT 'menor'`,
    `CREATE INDEX IF NOT EXISTS ix_ventas_modalidad ON ventas (modalidad)`,

    `ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS precio_lista NUMERIC(10, 2)`,
    // Las lineas viejas se cobraron al precio de lista.
    `UPDATE detalle_venta SET precio_lista = precio WHERE precio_lista IS NULL`,
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sentencia of this.sentencias) {
      await queryRunner.query(sentencia);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE detalle_venta DROP COLUMN IF EXISTS precio_lista`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS ix_ventas_modalidad`);
    await queryRunner.query(
      `ALTER TABLE ventas DROP COLUMN IF EXISTS modalidad`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS modalidad_venta_enum`);
    await queryRunner.query(
      `ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_minimo_mayor`,
    );
    await queryRunner.query(
      `ALTER TABLE productos DROP CONSTRAINT IF EXISTS ck_productos_precio_mayor`,
    );
    await queryRunner.query(
      `ALTER TABLE productos DROP COLUMN IF EXISTS minimo_mayor`,
    );
    await queryRunner.query(
      `ALTER TABLE productos DROP COLUMN IF EXISTS precio_mayor`,
    );
  }
}
