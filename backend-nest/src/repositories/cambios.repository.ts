import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

export interface VentaParaCambio {
  id: number;
  creada_en: string;
  cancelada_en: string | null;
  tipo_venta: string;
  total: string;
  cliente: string;
  dias_transcurridos: number;
}

export interface LineaDeVenta {
  detalle_venta_id: number;
  producto_sucursal_id: number;
  sucursal_id: number;
  sucursal: string;
  producto_id: number;
  modelo_id: number | null;
  producto: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
  precio: string;
  cambiada: number;
}

export interface StockBloqueado {
  id: number;
  sucursal_id: number;
  producto: string;
  cantidad: number;
  cantidad_reservada: number;
  precio: string;
}

/** Consultas de cambios de prendas (todas pasan por RLS: solo la empresa actual). */
@Injectable()
export class CambiosRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  transaccion<T>(fn: (m: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(fn);
  }

  async diasParaCambios(m: EntityManager = this.dataSource.manager): Promise<number> {
    const [fila] = await m.query(
      `SELECT dias_para_cambios FROM empresas WHERE id = fs_empresa_actual()`,
    );
    return fila?.dias_para_cambios ?? 15;
  }

  async venta(ventaId: number, m: EntityManager = this.dataSource.manager, bloquear = false) {
    const [fila] = await m.query(
      `SELECT v.id, v.creada_en, v.cancelada_en, v.tipo_venta, v.total::text AS total,
              u.nombre || ' ' || u.apellido AS cliente,
              (current_date - v.creada_en::date)::int AS dias_transcurridos
         FROM ventas v
         JOIN usuarios u ON u.id = v.usuario_id
        WHERE v.id = $1
        ${bloquear ? 'FOR UPDATE OF v' : ''}`,
      [ventaId],
    );
    return (fila as VentaParaCambio | undefined) ?? null;
  }

  /** Lineas de la venta con lo que ya se cambio de cada una. */
  lineas(ventaId: number, m: EntityManager = this.dataSource.manager): Promise<LineaDeVenta[]> {
    return m.query(
      `SELECT dv.id AS detalle_venta_id, dv.producto_sucursal_id, ps.sucursal_id,
              s.nombre AS sucursal, p.id AS producto_id, p.modelo_id,
              COALESCE(mo.nombre, p.nombre) AS producto, t.nombre AS talla, c.nombre AS color,
              dv.cantidad, dv.precio::text AS precio,
              COALESCE((SELECT SUM(dc.cantidad) FROM detalle_cambio dc
                         WHERE dc.detalle_venta_id = dv.id), 0)::int AS cambiada
         FROM detalle_venta dv
         JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
         JOIN sucursales s ON s.id = ps.sucursal_id
         JOIN productos p ON p.id = ps.producto_id
         LEFT JOIN modelos mo ON mo.id = p.modelo_id
         LEFT JOIN talla t ON t.id = p.talla_id
         LEFT JOIN colores c ON c.id = p.color_id
        WHERE dv.venta_id = $1
        ORDER BY dv.id`,
      [ventaId],
    );
  }

  /** Prendas con stock disponible en las sucursales indicadas (para elegir el cambio). */
  alternativas(sucursales: number[]): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT ps.id AS producto_sucursal_id, ps.sucursal_id, p.id AS producto_id, p.modelo_id,
              COALESCE(mo.nombre, p.nombre) AS producto, t.nombre AS talla, c.nombre AS color,
              ps.precio::text AS precio,
              (ps.cantidad - ps.cantidad_reservada)::int AS disponible
         FROM producto_sucursal ps
         JOIN productos p ON p.id = ps.producto_id
         LEFT JOIN modelos mo ON mo.id = p.modelo_id
         LEFT JOIN talla t ON t.id = p.talla_id
         LEFT JOIN colores c ON c.id = p.color_id
        WHERE ps.sucursal_id = ANY($1) AND ps.cantidad - ps.cantidad_reservada > 0
        ORDER BY producto, t.nombre, c.nombre`,
      [sucursales],
    );
  }

  /** Bloquea las filas de stock (en orden de id, para no generar interbloqueos). */
  bloquearStock(m: EntityManager, ids: number[]): Promise<StockBloqueado[]> {
    return m.query(
      `SELECT ps.id, ps.sucursal_id, p.nombre AS producto, ps.cantidad, ps.cantidad_reservada,
              ps.precio::text AS precio
         FROM producto_sucursal ps
         JOIN productos p ON p.id = ps.producto_id
        WHERE ps.id = ANY($1)
        ORDER BY ps.id
        FOR UPDATE OF ps`,
      [ids],
    );
  }

  async moverStock(m: EntityManager, stockId: number, delta: number): Promise<void> {
    await m.query(`UPDATE producto_sucursal SET cantidad = cantidad + $2 WHERE id = $1`, [stockId, delta]);
  }

  async sucursalDeTrabajador(usuarioId: number): Promise<number | null> {
    const [fila] = await this.dataSource.query(`SELECT sucursal_id FROM trabajador WHERE id = $1`, [usuarioId]);
    return fila?.sucursal_id ?? null;
  }

  async insertarCambio(
    m: EntityManager,
    datos: {
      venta_id: number;
      sucursal_id: number;
      usuario_id: number;
      motivo: string;
      observacion: string | null;
      total_devuelto: string;
      total_nuevo: string;
      diferencia: string;
    },
  ): Promise<number> {
    const [fila] = await m.query(
      `INSERT INTO cambios (venta_id, sucursal_id, usuario_id, motivo, observacion,
                            total_devuelto, total_nuevo, diferencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        datos.venta_id,
        datos.sucursal_id,
        datos.usuario_id,
        datos.motivo,
        datos.observacion,
        datos.total_devuelto,
        datos.total_nuevo,
        datos.diferencia,
      ],
    );
    return fila.id;
  }

  async insertarDetalle(
    m: EntityManager,
    d: {
      cambio_id: number;
      detalle_venta_id: number;
      stock_devuelto_id: number;
      stock_nuevo_id: number;
      cantidad: number;
      precio_devuelto: string;
      precio_nuevo: string;
    },
  ): Promise<void> {
    await m.query(
      `INSERT INTO detalle_cambio (cambio_id, detalle_venta_id, stock_devuelto_id, stock_nuevo_id,
                                   cantidad, precio_devuelto, precio_nuevo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [d.cambio_id, d.detalle_venta_id, d.stock_devuelto_id, d.stock_nuevo_id, d.cantidad, d.precio_devuelto, d.precio_nuevo],
    );
  }

  listar(ventaId?: number): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT c.id, c.venta_id, c.motivo, c.observacion, c.total_devuelto::text AS total_devuelto,
              c.total_nuevo::text AS total_nuevo, c.diferencia::text AS diferencia, c.creada_en,
              s.nombre AS sucursal, u.username AS registrado_por,
              (SELECT SUM(dc.cantidad) FROM detalle_cambio dc WHERE dc.cambio_id = c.id)::int AS prendas
         FROM cambios c
         JOIN sucursales s ON s.id = c.sucursal_id
         JOIN usuarios u ON u.id = c.usuario_id
        WHERE ($1::int IS NULL OR c.venta_id = $1)
        ORDER BY c.creada_en DESC
        LIMIT 200`,
      [ventaId ?? null],
    );
  }

  detalles(cambioId: number): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT dc.cantidad, dc.precio_devuelto::text AS precio_devuelto, dc.precio_nuevo::text AS precio_nuevo,
              pd.nombre AS devuelta, pn.nombre AS nueva
         FROM detalle_cambio dc
         JOIN producto_sucursal sd ON sd.id = dc.stock_devuelto_id
         JOIN productos pd ON pd.id = sd.producto_id
         JOIN producto_sucursal sn ON sn.id = dc.stock_nuevo_id
         JOIN productos pn ON pn.id = sn.producto_id
        WHERE dc.cambio_id = $1
        ORDER BY dc.id`,
      [cambioId],
    );
  }
}
