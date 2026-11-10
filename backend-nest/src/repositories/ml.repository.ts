import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface FilaDemanda {
  semana: string;
  sucursal_id: number;
  categoria_id: number;
  unidades: number;
  importe: number;
  promocion: boolean;
}

export interface ClienteRfm {
  id: number | null;
  nombre: string;
  recencia_dias: number;
  frecuencia: number;
  monto: number;
}

export interface ModeloGuardado {
  id: number;
  tipo: 'demanda' | 'segmentos';
  version: number;
  algoritmo: string;
  entrenado_en: string;
  filas_entrenamiento: number;
  filas_prueba: number;
  parametros: Record<string, unknown>;
  metricas: Record<string, unknown>;
  resultados: Record<string, unknown>;
}

/**
 * Consultas del modulo de analitica. Todas pasan por RLS: cada empresa
 * entrena y ve solo sus propios datos y modelos.
 */
@Injectable()
export class MlRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  sucursales(): Promise<{ id: number; nombre: string }[]> {
    return this.dataSource.query(`SELECT id, nombre FROM sucursales ORDER BY id`);
  }

  /** Categorias con su precio promedio y su peso en las ventas reales. */
  categorias(): Promise<{ id: number; nombre: string; precio: number; unidades: number }[]> {
    return this.dataSource.query(
      `SELECT c.id, c.nombre,
              COALESCE((SELECT AVG(p.precio) FROM productos p WHERE p.categoria_id = c.id), 150)::float AS precio,
              COALESCE((SELECT SUM(dv.cantidad)
                          FROM detalle_venta dv
                          JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
                          JOIN productos p ON p.id = ps.producto_id
                         WHERE p.categoria_id = c.id), 0)::int AS unidades
         FROM categorias c
        ORDER BY c.id`,
    );
  }

  // --------------------------------------------------------- datos sinteticos

  async borrarDatos(): Promise<void> {
    await this.dataSource.query(`DELETE FROM ml_demanda_semanal`);
    await this.dataSource.query(`DELETE FROM ml_clientes_sinteticos`);
  }

  async insertarDemanda(filas: FilaDemanda[]): Promise<void> {
    for (let i = 0; i < filas.length; i += 1000) {
      const lote = filas.slice(i, i + 1000);
      await this.dataSource.query(
        `INSERT INTO ml_demanda_semanal (semana, sucursal_id, categoria_id, unidades, importe, promocion)
         SELECT * FROM unnest($1::date[], $2::int[], $3::int[], $4::int[], $5::numeric[], $6::bool[])`,
        [
          lote.map((f) => f.semana),
          lote.map((f) => f.sucursal_id),
          lote.map((f) => f.categoria_id),
          lote.map((f) => f.unidades),
          lote.map((f) => f.importe),
          lote.map((f) => f.promocion),
        ],
      );
    }
  }

  /** Suma al historial las ventas reales del sistema (por semana, sucursal y categoria). */
  async sumarVentasReales(): Promise<number> {
    const filas: { n: number }[] = await this.dataSource.query(
      `WITH reales AS (
         SELECT date_trunc('week', v.creada_en)::date AS semana, ps.sucursal_id, p.categoria_id,
                SUM(dv.cantidad)::int AS unidades, SUM(dv.cantidad * dv.precio) AS importe
           FROM ventas v
           JOIN detalle_venta dv ON dv.venta_id = v.id
           JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
           JOIN productos p ON p.id = ps.producto_id
          WHERE v.cancelada_en IS NULL AND p.categoria_id IS NOT NULL
            -- solo semanas cerradas: la semana en curso esta incompleta
            AND v.creada_en < date_trunc('week', now())
          GROUP BY 1, 2, 3
       ), insertadas AS (
         INSERT INTO ml_demanda_semanal (semana, sucursal_id, categoria_id, unidades, unidades_reales, importe)
         SELECT semana, sucursal_id, categoria_id, unidades, unidades, importe FROM reales
         ON CONFLICT (empresa_id, semana, sucursal_id, categoria_id) DO UPDATE
           SET unidades = ml_demanda_semanal.unidades + excluded.unidades_reales,
               unidades_reales = excluded.unidades_reales,
               importe = ml_demanda_semanal.importe + excluded.importe
         RETURNING 1
       )
       SELECT COUNT(*)::int AS n FROM insertadas`,
    );
    return filas[0]?.n ?? 0;
  }

  async demanda(): Promise<FilaDemanda[]> {
    const filas = await this.dataSource.query(
      `SELECT semana::text AS semana, sucursal_id, categoria_id, unidades,
              importe::float AS importe, promocion
         FROM ml_demanda_semanal
        ORDER BY sucursal_id, categoria_id, semana`,
    );
    return filas;
  }

  async resumenDatos(): Promise<Record<string, unknown>> {
    const [fila] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS filas,
              COUNT(DISTINCT semana)::int AS semanas,
              MIN(semana)::text AS desde, MAX(semana)::text AS hasta,
              COALESCE(SUM(unidades), 0)::int AS unidades,
              COALESCE(SUM(unidades_reales), 0)::int AS unidades_reales,
              (SELECT COUNT(*)::int FROM ml_clientes_sinteticos) AS clientes_sinteticos
         FROM ml_demanda_semanal`,
    );
    return fila;
  }

  async insertarClientes(
    filas: { codigo: string; perfil: string; recencia_dias: number; frecuencia: number; monto: number }[],
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO ml_clientes_sinteticos (codigo, perfil, recencia_dias, frecuencia, monto)
       SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::int[], $4::int[], $5::numeric[])`,
      [
        filas.map((f) => f.codigo),
        filas.map((f) => f.perfil),
        filas.map((f) => f.recencia_dias),
        filas.map((f) => f.frecuencia),
        filas.map((f) => f.monto),
      ],
    );
  }

  clientesSinteticos(): Promise<ClienteRfm[]> {
    return this.dataSource.query(
      `SELECT NULL::int AS id, codigo AS nombre, recencia_dias, frecuencia, monto::float AS monto
         FROM ml_clientes_sinteticos`,
    );
  }

  /** Recencia, frecuencia y monto de los clientes reales con al menos una compra. */
  clientesReales(): Promise<ClienteRfm[]> {
    return this.dataSource.query(
      `SELECT u.id, u.nombre || ' ' || u.apellido AS nombre,
              (current_date - MAX(v.creada_en)::date)::int AS recencia_dias,
              COUNT(*)::int AS frecuencia,
              SUM(v.total)::float AS monto
         FROM ventas v
         JOIN usuarios u ON u.id = v.usuario_id
         JOIN roles r ON r.id = u.rol_id AND r.nombre = 'cliente'
        WHERE v.cancelada_en IS NULL
        GROUP BY u.id, u.nombre, u.apellido`,
    );
  }

  // ------------------------------------------------------ datos del sistema

  promociones(): Promise<{ sucursal_id: number; desde: string; hasta: string }[]> {
    return this.dataSource.query(
      `SELECT sucursal_id, fecha_inicio::text AS desde, fecha_final::text AS hasta
         FROM promociones WHERE fecha_final >= current_date`,
    );
  }

  stockPorCategoria(): Promise<{ sucursal_id: number; categoria_id: number; disponible: number }[]> {
    return this.dataSource.query(
      `SELECT ps.sucursal_id, p.categoria_id,
              SUM(GREATEST(ps.cantidad - ps.cantidad_reservada, 0))::int AS disponible
         FROM producto_sucursal ps
         JOIN productos p ON p.id = ps.producto_id
        WHERE p.categoria_id IS NOT NULL
        GROUP BY ps.sucursal_id, p.categoria_id`,
    );
  }

  /** Ventas de los ultimos 6 meses para buscar montos atipicos. */
  ventasRecientes(): Promise<
    { id: number; total: number; fecha: string; cliente: string; tipo_venta: string }[]
  > {
    return this.dataSource.query(
      `SELECT v.id, v.total::float AS total, to_char(v.creada_en, 'YYYY-MM-DD') AS fecha,
              u.nombre || ' ' || u.apellido AS cliente, v.tipo_venta
         FROM ventas v
         JOIN usuarios u ON u.id = v.usuario_id
        WHERE v.cancelada_en IS NULL AND v.creada_en >= current_date - 180`,
    );
  }

  // ------------------------------------------------------------- modelos

  async guardarModelo(
    modelo: Omit<ModeloGuardado, 'id' | 'version' | 'entrenado_en'>,
  ): Promise<ModeloGuardado> {
    const [fila] = await this.dataSource.query(
      `INSERT INTO ml_modelos
         (tipo, version, algoritmo, filas_entrenamiento, filas_prueba, parametros, metricas, resultados)
       VALUES ($1::varchar,
               COALESCE((SELECT MAX(version) FROM ml_modelos WHERE tipo = $1::varchar), 0) + 1,
               $2, $3, $4, $5, $6, $7)
       RETURNING id, tipo, version, algoritmo, entrenado_en, filas_entrenamiento,
                 filas_prueba, parametros, metricas, resultados`,
      [
        modelo.tipo,
        modelo.algoritmo,
        modelo.filas_entrenamiento,
        modelo.filas_prueba,
        JSON.stringify(modelo.parametros),
        JSON.stringify(modelo.metricas),
        JSON.stringify(modelo.resultados),
      ],
    );
    return fila;
  }

  async ultimoModelo(tipo: 'demanda' | 'segmentos'): Promise<ModeloGuardado | null> {
    const [fila] = await this.dataSource.query(
      `SELECT id, tipo, version, algoritmo, entrenado_en, filas_entrenamiento, filas_prueba,
              parametros, metricas, resultados
         FROM ml_modelos WHERE tipo = $1 ORDER BY version DESC LIMIT 1`,
      [tipo],
    );
    return fila ?? null;
  }

  historial(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT tipo, version, algoritmo, entrenado_en, filas_entrenamiento, filas_prueba, metricas
         FROM ml_modelos ORDER BY entrenado_en DESC LIMIT 20`,
    );
  }
}
