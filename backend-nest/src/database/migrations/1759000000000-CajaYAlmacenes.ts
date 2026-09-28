import type { MigrationInterface, QueryRunner } from 'typeorm';

// Turnos de caja con arqueo, metodo de pago en las ventas y almacenes con su
// propio stock y un historial de movimientos (ingresos, envios y devoluciones).
export class CajaYAlmacenes1759000000000 implements MigrationInterface {
  name = 'CajaYAlmacenes1759000000000';

  private readonly sentencias: string[] = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metodo_pago_enum') THEN
         CREATE TYPE metodo_pago_enum AS ENUM ('efectivo', 'tarjeta', 'qr');
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimiento_caja_enum') THEN
         CREATE TYPE tipo_movimiento_caja_enum AS ENUM ('ingreso', 'egreso');
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimiento_almacen_enum') THEN
         CREATE TYPE tipo_movimiento_almacen_enum AS ENUM ('ingreso', 'envio', 'devolucion');
       END IF;
     END $$`,

    `CREATE TABLE IF NOT EXISTS turnos_caja (
       id SERIAL PRIMARY KEY,
       sucursal_id INTEGER NOT NULL REFERENCES sucursales (id),
       cajero_id INTEGER NOT NULL REFERENCES usuarios (id),
       monto_inicial NUMERIC(10, 2) NOT NULL,
       abierto_en TIMESTAMP NOT NULL DEFAULT now(),
       cerrado_en TIMESTAMP,
       efectivo_esperado NUMERIC(10, 2),
       efectivo_contado NUMERIC(10, 2),
       diferencia NUMERIC(10, 2),
       observacion TEXT,
       CONSTRAINT ck_turnos_caja_monto_inicial CHECK (monto_inicial >= 0),
       CONSTRAINT ck_turnos_caja_cierre CHECK (
         (cerrado_en IS NULL AND efectivo_contado IS NULL)
         OR (cerrado_en IS NOT NULL AND efectivo_contado IS NOT NULL
             AND efectivo_esperado IS NOT NULL AND diferencia IS NOT NULL)
       )
     )`,
    `CREATE INDEX IF NOT EXISTS ix_turnos_caja_sucursal ON turnos_caja (sucursal_id)`,
    `CREATE INDEX IF NOT EXISTS ix_turnos_caja_abierto_en ON turnos_caja (abierto_en)`,
    // Un cajero no puede tener dos turnos abiertos a la vez.
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_turnos_caja_abierto
       ON turnos_caja (cajero_id) WHERE cerrado_en IS NULL`,

    `CREATE TABLE IF NOT EXISTS movimientos_caja (
       id SERIAL PRIMARY KEY,
       turno_id INTEGER NOT NULL REFERENCES turnos_caja (id) ON DELETE CASCADE,
       tipo tipo_movimiento_caja_enum NOT NULL,
       monto NUMERIC(10, 2) NOT NULL,
       motivo VARCHAR(255) NOT NULL,
       usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
       creado_en TIMESTAMP NOT NULL DEFAULT now(),
       CONSTRAINT ck_movimientos_caja_monto CHECK (monto > 0)
     )`,
    `CREATE INDEX IF NOT EXISTS ix_movimientos_caja_turno ON movimientos_caja (turno_id)`,

    `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS metodo_pago metodo_pago_enum`,
    `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS turno_id INTEGER REFERENCES turnos_caja (id)`,
    `CREATE INDEX IF NOT EXISTS ix_ventas_turno ON ventas (turno_id)`,
    // Las ventas previas pagadas por la pasarela fueron con tarjeta.
    `UPDATE ventas SET metodo_pago = 'tarjeta' WHERE pago_id IS NOT NULL AND metodo_pago IS NULL`,

    `CREATE TABLE IF NOT EXISTS almacenes (
       id SERIAL PRIMARY KEY,
       nombre VARCHAR(100) NOT NULL UNIQUE,
       ubicacion VARCHAR(255),
       ciudad_id INTEGER NOT NULL REFERENCES ciudades (id)
     )`,

    `CREATE TABLE IF NOT EXISTS producto_almacen (
       id SERIAL PRIMARY KEY,
       cantidad INTEGER NOT NULL DEFAULT 0,
       producto_id INTEGER NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
       almacen_id INTEGER NOT NULL REFERENCES almacenes (id) ON DELETE CASCADE,
       CONSTRAINT uq_producto_almacen UNIQUE (producto_id, almacen_id),
       CONSTRAINT ck_producto_almacen_cantidad CHECK (cantidad >= 0)
     )`,
    `CREATE INDEX IF NOT EXISTS ix_producto_almacen_almacen ON producto_almacen (almacen_id)`,

    `CREATE TABLE IF NOT EXISTS movimientos_almacen (
       id SERIAL PRIMARY KEY,
       tipo tipo_movimiento_almacen_enum NOT NULL,
       almacen_id INTEGER NOT NULL REFERENCES almacenes (id),
       sucursal_id INTEGER REFERENCES sucursales (id),
       usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
       observacion TEXT,
       creado_en TIMESTAMP NOT NULL DEFAULT now(),
       CONSTRAINT ck_movimientos_almacen_sucursal
         CHECK ((tipo = 'ingreso') = (sucursal_id IS NULL))
     )`,
    `CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_almacen ON movimientos_almacen (almacen_id)`,

    `CREATE TABLE IF NOT EXISTS detalle_movimiento_almacen (
       id SERIAL PRIMARY KEY,
       movimiento_id INTEGER NOT NULL REFERENCES movimientos_almacen (id) ON DELETE CASCADE,
       producto_id INTEGER NOT NULL REFERENCES productos (id),
       cantidad INTEGER NOT NULL,
       CONSTRAINT ck_detalle_movimiento_almacen_cantidad CHECK (cantidad > 0)
     )`,
    `CREATE INDEX IF NOT EXISTS ix_detalle_movimiento_almacen_movimiento
       ON detalle_movimiento_almacen (movimiento_id)`,
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sentencia of this.sentencias) {
      await queryRunner.query(sentencia);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS detalle_movimiento_almacen`);
    await queryRunner.query(`DROP TABLE IF EXISTS movimientos_almacen`);
    await queryRunner.query(`DROP TABLE IF EXISTS producto_almacen`);
    await queryRunner.query(`DROP TABLE IF EXISTS almacenes`);

    await queryRunner.query(`DROP INDEX IF EXISTS ix_ventas_turno`);
    await queryRunner.query(
      `ALTER TABLE ventas DROP COLUMN IF EXISTS turno_id`,
    );
    await queryRunner.query(
      `ALTER TABLE ventas DROP COLUMN IF EXISTS metodo_pago`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS movimientos_caja`);
    await queryRunner.query(`DROP TABLE IF EXISTS turnos_caja`);

    await queryRunner.query(`DROP TYPE IF EXISTS tipo_movimiento_almacen_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS tipo_movimiento_caja_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS metodo_pago_enum`);
  }
}
