import type { MigrationInterface, QueryRunner } from 'typeorm';

// Pedidos online con entrega (retiro o domicilio), seguimiento de estados,
// tarifa de envio por ciudad y pago contraentrega.
export class EnviosYContraentrega1759100000000 implements MigrationInterface {
  name = 'EnviosYContraentrega1759100000000';

  private readonly sentencias: string[] = [
    // Postgres 12+ permite agregar el valor dentro de la transaccion (no se usa en ella).
    `ALTER TYPE metodo_pago_enum ADD VALUE IF NOT EXISTS 'contraentrega'`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_pago_enum') THEN
         CREATE TYPE estado_pago_enum AS ENUM ('pagado', 'pendiente', 'reembolsado');
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modalidad_entrega_enum') THEN
         CREATE TYPE modalidad_entrega_enum AS ENUM ('retiro', 'domicilio');
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_envio_enum') THEN
         CREATE TYPE estado_envio_enum AS ENUM
           ('pendiente', 'preparando', 'en_camino', 'listo_retiro', 'entregado', 'cancelado');
       END IF;
     END $$`,

    `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado_pago estado_pago_enum NOT NULL DEFAULT 'pagado'`,
    `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cancelada_en TIMESTAMP`,

    `ALTER TABLE ciudades ADD COLUMN IF NOT EXISTS costo_envio NUMERIC(10, 2)`,
    `ALTER TABLE ciudades DROP CONSTRAINT IF EXISTS ck_ciudades_costo_envio`,
    `ALTER TABLE ciudades ADD CONSTRAINT ck_ciudades_costo_envio CHECK (costo_envio IS NULL OR costo_envio >= 0)`,
    // Tarifa inicial para las ciudades que ya existen; el administrador la ajusta despues.
    `UPDATE ciudades SET costo_envio = 20.00 WHERE costo_envio IS NULL`,

    `CREATE TABLE IF NOT EXISTS envios (
       id SERIAL PRIMARY KEY,
       venta_id INTEGER NOT NULL REFERENCES ventas (id) ON DELETE CASCADE,
       modalidad modalidad_entrega_enum NOT NULL,
       estado estado_envio_enum NOT NULL DEFAULT 'pendiente',
       sucursal_id INTEGER NOT NULL REFERENCES sucursales (id),
       ciudad_id INTEGER REFERENCES ciudades (id),
       direccion VARCHAR(255),
       referencia VARCHAR(255),
       destinatario VARCHAR(150),
       telefono VARCHAR(20),
       costo NUMERIC(10, 2) NOT NULL DEFAULT 0,
       motivo_cancelacion TEXT,
       creado_en TIMESTAMP NOT NULL DEFAULT now(),
       actualizado_en TIMESTAMP NOT NULL DEFAULT now(),
       entregado_en TIMESTAMP,
       CONSTRAINT ck_envios_costo CHECK (costo >= 0),
       CONSTRAINT ck_envios_domicilio CHECK (
         modalidad = 'retiro'
         OR (ciudad_id IS NOT NULL AND direccion IS NOT NULL
             AND destinatario IS NOT NULL AND telefono IS NOT NULL)
       )
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_envios_venta ON envios (venta_id)`,
    `CREATE INDEX IF NOT EXISTS ix_envios_estado ON envios (estado)`,
    `CREATE INDEX IF NOT EXISTS ix_envios_sucursal ON envios (sucursal_id)`,

    `CREATE TABLE IF NOT EXISTS envio_eventos (
       id SERIAL PRIMARY KEY,
       envio_id INTEGER NOT NULL REFERENCES envios (id) ON DELETE CASCADE,
       estado estado_envio_enum NOT NULL,
       nota VARCHAR(255),
       usuario_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
       creado_en TIMESTAMP NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS ix_envio_eventos_envio ON envio_eventos (envio_id)`,
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sentencia of this.sentencias) {
      await queryRunner.query(sentencia);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS envio_eventos`);
    await queryRunner.query(`DROP TABLE IF EXISTS envios`);
    await queryRunner.query(`DROP TYPE IF EXISTS estado_envio_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS modalidad_entrega_enum`);

    await queryRunner.query(
      `ALTER TABLE ciudades DROP CONSTRAINT IF EXISTS ck_ciudades_costo_envio`,
    );
    await queryRunner.query(
      `ALTER TABLE ciudades DROP COLUMN IF EXISTS costo_envio`,
    );

    await queryRunner.query(
      `ALTER TABLE ventas DROP COLUMN IF EXISTS cancelada_en`,
    );
    await queryRunner.query(
      `ALTER TABLE ventas DROP COLUMN IF EXISTS estado_pago`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS estado_pago_enum`);

    // Postgres no permite quitar un valor de un enum: se recrea el tipo sin el.
    await queryRunner.query(
      `UPDATE ventas SET metodo_pago = NULL WHERE metodo_pago = 'contraentrega'`,
    );
    await queryRunner.query(
      `ALTER TYPE metodo_pago_enum RENAME TO metodo_pago_enum_viejo`,
    );
    await queryRunner.query(
      `CREATE TYPE metodo_pago_enum AS ENUM ('efectivo', 'tarjeta', 'qr')`,
    );
    await queryRunner.query(
      `ALTER TABLE ventas ALTER COLUMN metodo_pago TYPE metodo_pago_enum
         USING metodo_pago::text::metodo_pago_enum`,
    );
    await queryRunner.query(`DROP TYPE metodo_pago_enum_viejo`);
  }
}
