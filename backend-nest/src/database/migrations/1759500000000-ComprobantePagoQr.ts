import type { MigrationInterface, QueryRunner } from 'typeorm';

// Foto del comprobante que sube el cliente al pagar un pedido en linea por QR.
// Guarda la clave del archivo privado (no una URL publica).
export class ComprobantePagoQr1759500000000 implements MigrationInterface {
  name = 'ComprobantePagoQr1759500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comprobante_pago VARCHAR(255)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ventas DROP COLUMN IF EXISTS comprobante_pago`,
    );
  }
}
