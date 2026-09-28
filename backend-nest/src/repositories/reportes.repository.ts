import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface RangoDeFechas {
  desde?: string;
  hasta?: string;
  sucursal_id?: number;
}

@Injectable()
export class ReportesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  resumenDeVentas(rango: RangoDeFechas): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         COUNT(DISTINCT v.id)::int                       AS ventas,
         COALESCE(SUM(dv.cantidad), 0)::int              AS unidades,
         COALESCE(SUM(dv.cantidad * dv.precio), 0)::text AS importe,
         COUNT(DISTINCT v.usuario_id)::int               AS clientes
       FROM ventas v
       JOIN detalle_venta dv ON dv.venta_id = v.id
       JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
       WHERE v.cancelada_en IS NULL
         AND ($1::date IS NULL OR v.creada_en >= $1::date)
         AND ($2::date IS NULL OR v.creada_en < $2::date + INTERVAL '1 day')
         AND ($3::int IS NULL OR ps.sucursal_id = $3::int)`,
      [rango.desde ?? null, rango.hasta ?? null, rango.sucursal_id ?? null],
    );
  }

  ventasPorDia(rango: RangoDeFechas): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         to_char(v.creada_en, 'YYYY-MM-DD')              AS dia,
         COUNT(DISTINCT v.id)::int                       AS ventas,
         COALESCE(SUM(dv.cantidad * dv.precio), 0)::text AS importe
       FROM ventas v
       JOIN detalle_venta dv ON dv.venta_id = v.id
       JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
       WHERE v.cancelada_en IS NULL
         AND ($1::date IS NULL OR v.creada_en >= $1::date)
         AND ($2::date IS NULL OR v.creada_en < $2::date + INTERVAL '1 day')
         AND ($3::int IS NULL OR ps.sucursal_id = $3::int)
       GROUP BY dia
       ORDER BY dia`,
      [rango.desde ?? null, rango.hasta ?? null, rango.sucursal_id ?? null],
    );
  }

  topProductos(
    rango: RangoDeFechas,
    limite = 10,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         p.id                                            AS producto_id,
         p.nombre                                        AS producto,
         COALESCE(c.nombre, 'sin categoria')             AS categoria,
         SUM(dv.cantidad)::int                           AS unidades,
         SUM(dv.cantidad * dv.precio)::text              AS importe
       FROM detalle_venta dv
       JOIN ventas v ON v.id = dv.venta_id
       JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
       JOIN productos p ON p.id = ps.producto_id
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE v.cancelada_en IS NULL
         AND ($1::date IS NULL OR v.creada_en >= $1::date)
         AND ($2::date IS NULL OR v.creada_en < $2::date + INTERVAL '1 day')
         AND ($3::int IS NULL OR ps.sucursal_id = $3::int)
       GROUP BY p.id, p.nombre, c.nombre
       ORDER BY unidades DESC, importe DESC
       LIMIT $4`,
      [
        rango.desde ?? null,
        rango.hasta ?? null,
        rango.sucursal_id ?? null,
        limite,
      ],
    );
  }

  ventasPorSucursal(rango: RangoDeFechas): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         s.id                                            AS sucursal_id,
         s.nombre                                        AS sucursal,
         COUNT(DISTINCT v.id)::int                       AS ventas,
         COALESCE(SUM(dv.cantidad), 0)::int              AS unidades,
         COALESCE(SUM(dv.cantidad * dv.precio), 0)::text AS importe
       FROM ventas v
       JOIN detalle_venta dv ON dv.venta_id = v.id
       JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
       JOIN sucursales s ON s.id = ps.sucursal_id
       WHERE v.cancelada_en IS NULL
         AND ($1::date IS NULL OR v.creada_en >= $1::date)
         AND ($2::date IS NULL OR v.creada_en < $2::date + INTERVAL '1 day')
         AND ($3::int IS NULL OR ps.sucursal_id = $3::int)
       GROUP BY s.id, s.nombre
       ORDER BY SUM(dv.cantidad * dv.precio) DESC`,
      [rango.desde ?? null, rango.hasta ?? null, rango.sucursal_id ?? null],
    );
  }

  reservasDelRango(
    rango: RangoDeFechas,
    limite = 200,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         r.id                                      AS reserva_id,
         r.fecha::text                             AS fecha,
         to_char(r.hora, 'HH24:MI')                AS hora,
         u.nombre || ' ' || u.apellido             AS cliente,
         COALESCE(s.nombre, 'sin sucursal')        AS sucursal,
         COALESCE(SUM(rs.cantidad), 0)::int        AS prendas,
         CASE
           WHEN r.asistencia THEN 'asistio'
           WHEN r.fecha + r.hora < LOCALTIMESTAMP THEN 'no asistio'
           ELSE 'pendiente'
         END                                       AS estado
       FROM reserva r
       JOIN usuarios u ON u.id = r.usuario_id
       LEFT JOIN sucursales s ON s.id = r.sucursal_id
       LEFT JOIN reserva_sucursal rs ON rs.reserva_id = r.id
       WHERE ($1::date IS NULL OR r.fecha >= $1::date)
         AND ($2::date IS NULL OR r.fecha <= $2::date)
         AND ($3::int IS NULL OR r.sucursal_id = $3::int)
       GROUP BY r.id, u.nombre, u.apellido, s.nombre
       ORDER BY r.fecha, r.hora
       LIMIT $4`,
      [
        rango.desde ?? null,
        rango.hasta ?? null,
        rango.sucursal_id ?? null,
        limite,
      ],
    );
  }

  sucursales(): Promise<{ id: number; nombre: string }[]> {
    return this.dataSource.query(
      `SELECT id, nombre FROM sucursales ORDER BY nombre`,
    );
  }

  inventarioPorSucursal(
    sucursalId?: number,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         s.id                                                       AS sucursal_id,
         s.nombre                                                   AS sucursal,
         COUNT(*)::int                                              AS lineas,
         COALESCE(SUM(ps.cantidad), 0)::int                         AS unidades,
         COALESCE(SUM(ps.cantidad_reservada), 0)::int               AS reservadas,
         COALESCE(SUM(ps.cantidad - ps.cantidad_reservada), 0)::int AS disponibles,
         COALESCE(SUM(ps.cantidad * ps.precio), 0)::text            AS valorizado,
         COUNT(*) FILTER (WHERE ps.cantidad = 0)::int               AS agotados
       FROM producto_sucursal ps
       JOIN sucursales s ON s.id = ps.sucursal_id
       WHERE ($1::int IS NULL OR ps.sucursal_id = $1::int)
       GROUP BY s.id, s.nombre
       ORDER BY s.nombre`,
      [sucursalId ?? null],
    );
  }

  porReponer(
    sucursalId?: number,
    umbral = 3,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         ps.id                                  AS stock_id,
         p.nombre                               AS producto,
         s.nombre                               AS sucursal,
         ps.cantidad::int                       AS cantidad,
         ps.cantidad_reservada::int             AS reservadas,
         (ps.cantidad - ps.cantidad_reservada)::int AS disponibles
       FROM producto_sucursal ps
       JOIN productos p ON p.id = ps.producto_id
       JOIN sucursales s ON s.id = ps.sucursal_id
       WHERE ($1::int IS NULL OR ps.sucursal_id = $1::int)
         AND ps.cantidad - ps.cantidad_reservada <= $2
       ORDER BY disponibles ASC, p.nombre
       LIMIT 50`,
      [sucursalId ?? null, umbral],
    );
  }

  reservasPendientes(sucursalId?: number): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         COALESCE(s.nombre, 'sin sucursal') AS sucursal,
         COUNT(*)::int                      AS reservas,
         MIN(r.fecha)::text                 AS proxima
       FROM reserva r
       LEFT JOIN sucursales s ON s.id = r.sucursal_id
       WHERE r.asistencia = false
         AND r.fecha >= CURRENT_DATE
         AND ($1::int IS NULL OR r.sucursal_id = $1::int)
       GROUP BY s.nombre
       ORDER BY reservas DESC`,
      [sucursalId ?? null],
    );
  }

  async sucursalDeTrabajador(usuarioId: number): Promise<number | null> {
    const filas: { sucursal_id: number | null }[] = await this.dataSource.query(
      `SELECT sucursal_id FROM trabajador WHERE id = $1`,
      [usuarioId],
    );
    return filas[0]?.sucursal_id ?? null;
  }

  totalesDelDashboard(sucursalId?: number): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         COALESCE(SUM(v.total) FILTER (WHERE v.creada_en >= CURRENT_DATE), 0)::text
           AS importe_hoy,
         COUNT(*) FILTER (WHERE v.creada_en >= CURRENT_DATE)::int
           AS ventas_hoy,
         COALESCE(SUM(v.total) FILTER (WHERE v.creada_en >= date_trunc('month', CURRENT_DATE)), 0)::text
           AS importe_mes,
         COUNT(*) FILTER (WHERE v.creada_en >= date_trunc('month', CURRENT_DATE))::int
           AS ventas_mes
       FROM ventas v
       WHERE v.cancelada_en IS NULL
         AND ($1::int IS NULL
          OR EXISTS (
            SELECT 1
            FROM detalle_venta dv
            JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
            WHERE dv.venta_id = v.id AND ps.sucursal_id = $1::int
          ))`,
      [sucursalId ?? null],
    );
  }

  historialDeCliente(
    usuarioId: number,
    limite = 20,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         p.nombre                            AS producto,
         COALESCE(c.nombre, 'sin categoria') AS categoria,
         COALESCE(t.nombre, 'sin talla')     AS talla,
         COALESCE(co.nombre, 'sin color')    AS color,
         SUM(dv.cantidad)::int               AS unidades
       FROM detalle_venta dv
       JOIN ventas v ON v.id = dv.venta_id
       JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
       JOIN productos p ON p.id = ps.producto_id
       LEFT JOIN categorias c ON c.id = p.categoria_id
       LEFT JOIN talla t ON t.id = p.talla_id
       LEFT JOIN colores co ON co.id = p.color_id
       WHERE v.usuario_id = $1 AND v.cancelada_en IS NULL
       GROUP BY p.nombre, c.nombre, t.nombre, co.nombre
       ORDER BY unidades DESC
       LIMIT $2`,
      [usuarioId, limite],
    );
  }

  catalogoDisponible(
    sucursalId?: number,
    categoriaId?: number,
    tallaId?: number,
    limite = 60,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT
         p.id                                AS producto_id,
         p.nombre                            AS producto,
         COALESCE(c.nombre, 'sin categoria') AS categoria,
         COALESCE(t.nombre, 'sin talla')     AS talla,
         COALESCE(co.nombre, 'sin color')    AS color,
         COALESCE(tm.nombre, 'sin temporada') AS temporada,
         ps.precio::text                     AS precio,
         s.nombre                            AS sucursal,
         (ps.cantidad - ps.cantidad_reservada)::int AS disponibles
       FROM producto_sucursal ps
       JOIN productos p ON p.id = ps.producto_id
       JOIN sucursales s ON s.id = ps.sucursal_id
       LEFT JOIN categorias c ON c.id = p.categoria_id
       LEFT JOIN talla t ON t.id = p.talla_id
       LEFT JOIN colores co ON co.id = p.color_id
       LEFT JOIN temporadas tm ON tm.id = p.temporada_id
       WHERE ps.cantidad - ps.cantidad_reservada > 0
         AND ($1::int IS NULL OR ps.sucursal_id = $1::int)
         AND ($2::int IS NULL OR p.categoria_id = $2::int)
         AND ($3::int IS NULL OR p.talla_id = $3::int)
       ORDER BY disponibles DESC, p.nombre
       LIMIT $4`,
      [sucursalId ?? null, categoriaId ?? null, tallaId ?? null, limite],
    );
  }

  /**
   * Ejecuta el SQL que escribio la IA para un reporte libre. Corre en una transaccion
   * de solo lectura y con tiempo limite, y se envuelve en un SELECT con LIMIT.
   */
  consultaLibre(sql: string, limite = 500): Promise<Record<string, unknown>[]> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      await manager.query("SET LOCAL statement_timeout = '5s'");
      return manager.query(
        `SELECT * FROM (${sql}) AS consulta_libre LIMIT ${limite}`,
      );
    });
  }

  /**
   * Catalogo para el asistente de compra: una fila por prenda con todos sus atributos,
   * el precio mas bajo con stock y las unidades en la sucursal pedida y en total.
   */
  /**
   * Catalogo para el asistente de compra: una fila por producto base (modelo) con las
   * tallas y colores que tienen stock, el precio mas bajo, el precio por mayor y las
   * unidades en la sucursal pedida y en total. `producto_id` es la variante con mas stock
   * (en la sucursal si hay), para enlazar la tarjeta.
   */
  catalogoParaAsistente(
    sucursalId?: number,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `WITH disponible AS (
         SELECT p.id, p.modelo_id, p.color_id, p.talla_id,
                ps.precio,
                ps.cantidad - ps.cantidad_reservada AS unidades,
                ps.sucursal_id
           FROM productos p
           JOIN producto_sucursal ps ON ps.producto_id = p.id
          WHERE ps.cantidad - ps.cantidad_reservada > 0
       )
       SELECT
         m.id                                                   AS modelo_id,
         (SELECT d2.id FROM disponible d2
           WHERE d2.modelo_id = m.id
           ORDER BY (d2.sucursal_id = $1::int) DESC NULLS LAST, d2.unidades DESC
           LIMIT 1)                                             AS producto_id,
         m.nombre                                               AS nombre,
         LEFT(COALESCE(m.descripcion, ''), 160)                 AS descripcion,
         COALESCE(c.nombre, '')                                 AS categoria,
         COALESCE(cl.nombre, '')                                AS coleccion,
         COALESCE(tm.nombre, '')                                AS temporada,
         string_agg(DISTINCT co.nombre, ', ')                   AS colores,
         string_agg(DISTINCT t.nombre, ', ')                    AS tallas,
         MIN(d.precio)::text                                    AS precio,
         COALESCE(m.precio_mayor::text, '')                     AS precio_mayor,
         m.minimo_mayor                                         AS minimo_mayor,
         COALESCE(SUM(d.unidades) FILTER (WHERE d.sucursal_id = $1::int), 0)::int AS en_sucursal,
         SUM(d.unidades)::int                                   AS en_total
       FROM modelos m
       JOIN disponible d ON d.modelo_id = m.id
       LEFT JOIN categorias c ON c.id = m.categoria_id
       LEFT JOIN colecciones cl ON cl.id = m.coleccion_id
       LEFT JOIN temporadas tm ON tm.id = m.temporada_id
       LEFT JOIN colores co ON co.id = d.color_id
       LEFT JOIN talla t ON t.id = d.talla_id
       GROUP BY m.id, m.nombre, m.descripcion, c.nombre, cl.nombre, tm.nombre, m.precio_mayor, m.minimo_mayor
       ORDER BY m.id
       LIMIT 300`,
      [sucursalId ?? null],
    );
  }

  /** Sucursales con su ciudad, para contestar donde queda cada tienda. */
  sucursalesParaAsistente(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT s.nombre, COALESCE(s.ubicacion, '') AS ubicacion, c.nombre AS ciudad
         FROM sucursales s
         JOIN ciudades c ON c.id = s.ciudad_id
        ORDER BY c.nombre, s.nombre`,
    );
  }

  /** Tarifa de envio a domicilio por ciudad (nula = sin cobertura). */
  tarifasDeEnvio(): Promise<{ ciudad: string; costo: string | null }[]> {
    return this.dataSource.query(
      `SELECT nombre AS ciudad, costo_envio::text AS costo FROM ciudades ORDER BY nombre`,
    );
  }

  /** Promociones que estan corriendo hoy o empiezan en los proximos 30 dias. */
  promocionesVigentes(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT p.nombre, LEFT(COALESCE(p.descripcion, ''), 200) AS descripcion,
              p.fecha_inicio::text AS desde, p.fecha_final::text AS hasta,
              s.nombre AS sucursal
         FROM promociones p
         JOIN sucursales s ON s.id = p.sucursal_id
        WHERE p.fecha_final >= CURRENT_DATE
          AND p.fecha_inicio <= CURRENT_DATE + 30
        ORDER BY p.fecha_inicio
        LIMIT 30`,
    );
  }
}
