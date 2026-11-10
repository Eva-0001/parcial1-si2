import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Reserva } from '../entities/reserva.entity.js';
import { Venta } from '../entities/venta.entity.js';

// Margen hacia atras del "hasta" que se entrega al cliente. Cubre las
// transacciones que empezaron antes de la consulta pero confirmaron despues:
// sus filas quedan con un actualizado_en anterior al corte. Reenviar unos
// segundos de cambios no hace dano porque el cliente aplica todo como upsert.
const MARGEN_SEGUNDOS = 120;

// Columnas que el movil guarda de cada tabla del catalogo.
export const TABLAS_CATALOGO = {
  ciudades: { tabla: 'ciudades', columnas: 'id, nombre' },
  categorias: { tabla: 'categorias', columnas: 'id, nombre' },
  colecciones: { tabla: 'colecciones', columnas: 'id, nombre, descripcion' },
  colores: { tabla: 'colores', columnas: 'id, nombre' },
  tallas: { tabla: 'talla', columnas: 'id, nombre' },
  temporadas: { tabla: 'temporadas', columnas: 'id, nombre' },
  sucursales: {
    tabla: 'sucursales',
    columnas: 'id, nombre, ubicacion, foto, ciudad_id',
  },
  promociones: {
    tabla: 'promociones',
    columnas:
      'id, nombre, descripcion, fecha_inicio::text AS fecha_inicio, ' +
      'fecha_final::text AS fecha_final, foto, sucursal_id',
  },
  productos: {
    tabla: 'productos',
    columnas:
      'id, nombre, foto, precio, categoria_id, coleccion_id, color_id, ' +
      'talla_id, temporada_id, proveedor_id',
  },
  stock: {
    tabla: 'producto_sucursal',
    columnas:
      'id, cantidad, cantidad_reservada, precio, producto_id, sucursal_id',
  },
} as const;

export type RecursoCatalogo = keyof typeof TABLAS_CATALOGO;

@Injectable()
export class SyncRepository {
  constructor(
    @InjectRepository(Reserva) private readonly reservas: Repository<Reserva>,
    @InjectRepository(Venta) private readonly ventas: Repository<Venta>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async corte(): Promise<Date> {
    const [fila] = await this.dataSource.query(
      `SELECT now() - make_interval(secs => $1) AS hasta`,
      [MARGEN_SEGUNDOS],
    );
    return fila.hasta;
  }

  cambiosDe(
    recurso: RecursoCatalogo,
    desde: string | null,
  ): Promise<Record<string, unknown>[]> {
    const { tabla, columnas } = TABLAS_CATALOGO[recurso];
    return this.dataSource.query(
      `SELECT ${columnas} FROM ${tabla}
        WHERE $1::timestamptz IS NULL OR actualizado_en >= $1::timestamptz
        ORDER BY id`,
      [desde],
    );
  }

  eliminados(
    tablas: string[],
    desde: string,
    usuarioId: number | null = null,
  ): Promise<{ tabla: string; registro_id: number }[]> {
    return this.dataSource.query(
      `SELECT DISTINCT tabla, registro_id FROM sync_eliminados
        WHERE tabla = ANY($1)
          AND eliminado_en >= $2::timestamptz
          AND ($3::integer IS NULL OR usuario_id = $3::integer)`,
      [tablas, desde, usuarioId],
    );
  }

  async idsCambiados(
    tabla: 'reserva' | 'ventas',
    usuarioId: number,
    desde: string | null,
  ): Promise<number[]> {
    const filas: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM ${tabla}
        WHERE usuario_id = $1
          AND ($2::timestamptz IS NULL OR actualizado_en >= $2::timestamptz)`,
      [usuarioId, desde],
    );
    return filas.map((fila) => fila.id);
  }

  // -------------------------------------------- sincronizacion por lote

  async slugDeEmpresa(): Promise<string | null> {
    const [fila] = await this.dataSource.query(
      `SELECT slug FROM empresas WHERE id = fs_empresa_actual()`,
    );
    return fila?.slug ?? null;
  }

  async yaRegistrada(
    tipo: 'venta' | 'reserva',
    idCliente: string,
  ): Promise<number | null> {
    const tabla = tipo === 'venta' ? 'ventas' : 'reserva';
    const [fila] = await this.dataSource.query(
      `SELECT id FROM ${tabla} WHERE id_cliente = $1`,
      [idCliente],
    );
    return fila?.id ?? null;
  }

  /** Sucursal y disponibilidad real de cada stock (para validar y explicar conflictos). */
  stockReal(
    ids: number[],
  ): Promise<
    { id: number; sucursal_id: number; producto: string; disponible: number }[]
  > {
    return this.dataSource.query(
      `SELECT ps.id, ps.sucursal_id, p.nombre AS producto,
              (ps.cantidad - ps.cantidad_reservada)::int AS disponible
         FROM producto_sucursal ps
         JOIN productos p ON p.id = ps.producto_id
        WHERE ps.id = ANY($1)`,
      [ids],
    );
  }

  async registrarLog(
    filas: {
      lote: string;
      operacion_id: string;
      tipo: string;
      usuario_id: number;
      sucursal_id: number | null;
      dispositivo: string | null;
      intento: number;
      resultado: string;
      codigo_http: number | null;
      codigo_error: string | null;
      mensaje: string | null;
      servidor_id: number | null;
      duracion_ms: number;
    }[],
  ): Promise<void> {
    if (filas.length === 0) return;
    const columnas = [
      'lote',
      'operacion_id',
      'tipo',
      'usuario_id',
      'sucursal_id',
      'dispositivo',
      'intento',
      'resultado',
      'codigo_http',
      'codigo_error',
      'mensaje',
      'servidor_id',
      'duracion_ms',
    ] as const;
    const valores: unknown[] = [];
    const tuplas = filas.map((fila, i) => {
      columnas.forEach((c) => valores.push(fila[c]));
      return `(${columnas.map((_, j) => `$${i * columnas.length + j + 1}`).join(', ')})`;
    });
    await this.dataSource.query(
      `INSERT INTO sync_log (${columnas.join(', ')}) VALUES ${tuplas.join(', ')}`,
      valores,
    );
  }

  registro(resultado?: string): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT l.id, l.lote, l.operacion_id, l.tipo, l.dispositivo, l.intento, l.resultado,
              l.codigo_http, l.codigo_error, l.mensaje, l.servidor_id, l.duracion_ms, l.creado_en,
              u.username AS usuario, s.nombre AS sucursal
         FROM sync_log l
         LEFT JOIN usuarios u ON u.id = l.usuario_id
         LEFT JOIN sucursales s ON s.id = l.sucursal_id
        WHERE ($1::text IS NULL OR l.resultado = $1)
        ORDER BY l.creado_en DESC, l.id DESC
        LIMIT 200`,
      [resultado ?? null],
    );
  }

  async resumenRegistro(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT resultado, COUNT(*)::int AS operaciones
         FROM sync_log WHERE creado_en >= now() - interval '7 days'
        GROUP BY resultado`,
    );
  }

  // ------------------------------------------------ paquete del vendedor

  sucursales(): Promise<
    {
      id: number;
      nombre: string;
      ubicacion: string | null;
      ciudad: string | null;
    }[]
  > {
    return this.dataSource.query(
      `SELECT s.id, s.nombre, s.ubicacion, c.nombre AS ciudad
         FROM sucursales s
         LEFT JOIN ciudades c ON c.id = s.ciudad_id
        ORDER BY s.nombre`,
    );
  }

  async sucursalDeTrabajador(usuarioId: number): Promise<number | null> {
    const filas: { sucursal_id: number | null }[] = await this.dataSource.query(
      `SELECT sucursal_id FROM trabajador WHERE id = $1`,
      [usuarioId],
    );
    return filas[0]?.sucursal_id ?? null;
  }

  /** Cada variante con stock en la sucursal: precio y existencias conocidas. */
  prendasDeSucursal(sucursalId: number): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT ps.id                       AS stock_id,
              p.id                        AS producto_id,
              p.modelo_id,
              COALESCE(m.nombre, p.nombre) AS modelo,
              p.nombre,
              p.sku,
              p.foto,
              c.nombre                    AS categoria,
              co.nombre                   AS color,
              t.nombre                    AS talla,
              ps.precio::text             AS precio,
              p.precio_mayor::text        AS precio_mayor,
              p.minimo_mayor::int         AS minimo_mayor,
              ps.cantidad::int            AS cantidad,
              ps.cantidad_reservada::int  AS reservada
         FROM producto_sucursal ps
         JOIN productos p ON p.id = ps.producto_id
         LEFT JOIN modelos m ON m.id = p.modelo_id
         LEFT JOIN categorias c ON c.id = p.categoria_id
         LEFT JOIN colores co ON co.id = p.color_id
         LEFT JOIN talla t ON t.id = p.talla_id
        WHERE ps.sucursal_id = $1
        ORDER BY modelo, t.nombre, co.nombre`,
      [sucursalId],
    );
  }

  /** Datos minimos de los clientes para asociarlos a ventas y reservas. */
  clientes(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT u.id, u.nombre, u.apellido, u.username, u.correo
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
        WHERE r.nombre = 'cliente'
        ORDER BY u.apellido, u.nombre
        LIMIT 2000`,
    );
  }

  async turnoAbierto(
    usuarioId: number,
  ): Promise<{ id: number; sucursal_id: number; abierto_en: string } | null> {
    const filas = await this.dataSource.query(
      // abierto_en es timestamp sin zona: se le pone la de la base para que
      // el movil lo muestre en su hora local.
      `SELECT id, sucursal_id,
              to_json(abierto_en AT TIME ZONE current_setting('TimeZone')) #>> '{}' AS abierto_en
         FROM turnos_caja
        WHERE cajero_id = $1 AND cerrado_en IS NULL
        LIMIT 1`,
      [usuarioId],
    );
    return filas[0] ?? null;
  }

  reservasCompletas(ids: number[]): Promise<Reserva[]> {
    if (ids.length === 0) return Promise.resolve([]);

    return this.reservas.find({
      where: { id: In(ids) },
      relations: {
        detalles: { producto_sucursal: { producto: true, sucursal: true } },
      },
      order: { id: 'ASC', detalles: { id: 'ASC' } },
    });
  }

  ventasCompletas(ids: number[]): Promise<Venta[]> {
    if (ids.length === 0) return Promise.resolve([]);

    return this.ventas.find({
      where: { id: In(ids) },
      relations: {
        comprobantes: true,
        detalles: { producto_sucursal: { producto: true, sucursal: true } },
      },
      order: { id: 'ASC', detalles: { id: 'ASC' } },
    });
  }
}
