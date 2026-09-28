import type { MigrationInterface, QueryRunner } from 'typeorm';

interface ProductoViejo {
  id: number;
  nombre: string;
  precio: string;
  precio_mayor: string | null;
  minimo_mayor: number;
  categoria_id: number | null;
  coleccion_id: number | null;
  temporada_id: number | null;
  proveedor_id: number | null;
  color_id: number | null;
  talla_id: number | null;
}

/** "Polera X - Talla M" -> "Polera X": asi nombraba el sistema a cada talla. */
export function nombreBase(nombre: string): string {
  return nombre.replace(/\s*-\s*Talla\s+\S+\s*$/i, '').trim() || nombre.trim();
}

// Productos base (modelos) con variantes talla x color. Los productos que ya existen
// se agrupan por nombre base y proveedor; una combinacion talla/color repetida dentro
// de un grupo va a un modelo aparte para no romper la unicidad de las variantes.
export class ModelosDeProducto1759400000000 implements MigrationInterface {
  name = 'ModelosDeProducto1759400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS modelos (
         id SERIAL PRIMARY KEY,
         nombre VARCHAR(150) NOT NULL,
         descripcion TEXT,
         precio NUMERIC(10, 2) NOT NULL,
         precio_mayor NUMERIC(10, 2),
         minimo_mayor INTEGER NOT NULL DEFAULT 6,
         categoria_id INTEGER REFERENCES categorias (id),
         coleccion_id INTEGER REFERENCES colecciones (id),
         temporada_id INTEGER REFERENCES temporadas (id),
         proveedor_id INTEGER REFERENCES proveedores (id),
         creado_en TIMESTAMP NOT NULL DEFAULT now(),
         CONSTRAINT ck_modelos_precio_mayor
           CHECK (precio_mayor IS NULL OR (precio_mayor > 0 AND precio_mayor < precio)),
         CONSTRAINT ck_modelos_minimo_mayor CHECK (minimo_mayor >= 2)
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_modelos_nombre ON modelos (lower(nombre))`,
    );

    await queryRunner.query(
      `ALTER TABLE productos ADD COLUMN IF NOT EXISTS modelo_id INTEGER`,
    );
    await queryRunner.query(
      `ALTER TABLE productos ADD COLUMN IF NOT EXISTS sku VARCHAR(60)`,
    );

    await this.agruparExistentes(queryRunner);

    await queryRunner.query(
      `UPDATE productos SET sku = 'FS-' || lpad(id::text, 6, '0') WHERE sku IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE productos ALTER COLUMN modelo_id SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE productos ALTER COLUMN sku SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE productos DROP CONSTRAINT IF EXISTS fk_productos_modelo`,
    );
    await queryRunner.query(
      `ALTER TABLE productos ADD CONSTRAINT fk_productos_modelo
         FOREIGN KEY (modelo_id) REFERENCES modelos (id) ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_productos_modelo ON productos (modelo_id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_sku ON productos (sku)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_variante
         ON productos (modelo_id, color_id, talla_id)`,
    );
  }

  private async agruparExistentes(queryRunner: QueryRunner): Promise<void> {
    const productos: ProductoViejo[] = await queryRunner.query(
      `SELECT id, nombre, precio, precio_mayor, minimo_mayor, categoria_id, coleccion_id,
              temporada_id, proveedor_id, color_id, talla_id
         FROM productos
        WHERE modelo_id IS NULL
        ORDER BY id`,
    );

    // clave (nombre base + proveedor) -> modelos creados con las combinaciones que ya tienen
    const grupos = new Map<string, { id: number; combos: Set<string> }[]>();

    for (const p of productos) {
      const base = nombreBase(p.nombre);
      const clave = `${base.toLowerCase()}|${p.proveedor_id ?? ''}`;
      const combo = `${p.color_id ?? ''}|${p.talla_id ?? ''}`;
      const candidatos = grupos.get(clave) ?? [];

      let modelo = candidatos.find((m) => !m.combos.has(combo));
      if (!modelo) {
        const filas: { id: number }[] = await queryRunner.query(
          `INSERT INTO modelos (nombre, precio, precio_mayor, minimo_mayor, categoria_id,
                                coleccion_id, temporada_id, proveedor_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            base,
            p.precio,
            p.precio_mayor,
            p.minimo_mayor,
            p.categoria_id,
            p.coleccion_id,
            p.temporada_id,
            p.proveedor_id,
          ],
        );
        modelo = { id: filas[0].id, combos: new Set() };
        candidatos.push(modelo);
        grupos.set(clave, candidatos);
      }

      modelo.combos.add(combo);
      await queryRunner.query(
        `UPDATE productos SET modelo_id = $1 WHERE id = $2`,
        [modelo.id, p.id],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ux_productos_variante`);
    await queryRunner.query(`DROP INDEX IF EXISTS ux_productos_sku`);
    await queryRunner.query(`DROP INDEX IF EXISTS ix_productos_modelo`);
    await queryRunner.query(
      `ALTER TABLE productos DROP CONSTRAINT IF EXISTS fk_productos_modelo`,
    );
    await queryRunner.query(`ALTER TABLE productos DROP COLUMN IF EXISTS sku`);
    await queryRunner.query(
      `ALTER TABLE productos DROP COLUMN IF EXISTS modelo_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS modelos`);
  }
}
