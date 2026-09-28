import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Not, Repository } from 'typeorm';
import { Almacen } from '../entities/almacen.entity.js';
import { Ciudad } from '../entities/ciudad.entity.js';
import { MovimientoAlmacen } from '../entities/movimiento-almacen.entity.js';
import { Producto } from '../entities/producto.entity.js';
import { ProductoAlmacen } from '../entities/producto-almacen.entity.js';
import { ProductoSucursal } from '../entities/producto-sucursal.entity.js';
import { Sucursal } from '../entities/sucursal.entity.js';

export interface ResumenDeAlmacen {
  almacen_id: number;
  productos: number;
  unidades: number;
}

@Injectable()
export class AlmacenesRepository {
  constructor(
    @InjectRepository(Almacen)
    private readonly almacenes: Repository<Almacen>,
    @InjectRepository(ProductoAlmacen)
    private readonly stock: Repository<ProductoAlmacen>,
    @InjectRepository(MovimientoAlmacen)
    private readonly movimientos: Repository<MovimientoAlmacen>,
    @InjectRepository(Ciudad) private readonly ciudades: Repository<Ciudad>,
    @InjectRepository(Sucursal)
    private readonly sucursales: Repository<Sucursal>,
    @InjectRepository(Producto)
    private readonly productos: Repository<Producto>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  listar(): Promise<Almacen[]> {
    return this.almacenes.find({
      relations: { ciudad: true },
      order: { nombre: 'ASC' },
    });
  }

  /** Cantidad de productos distintos y unidades totales por almacen. */
  resumenes(): Promise<ResumenDeAlmacen[]> {
    return this.dataSource.query<ResumenDeAlmacen[]>(
      `SELECT almacen_id,
              COUNT(*) FILTER (WHERE cantidad > 0)::int AS productos,
              COALESCE(SUM(cantidad), 0)::int AS unidades
         FROM producto_almacen
        GROUP BY almacen_id`,
    );
  }

  obtener(id: number): Promise<Almacen | null> {
    return this.almacenes.findOne({
      where: { id },
      relations: { ciudad: true },
    });
  }

  nombreOcupado(nombre: string, excluirId?: number): Promise<boolean> {
    return this.almacenes.existsBy(
      excluirId === undefined ? { nombre } : { nombre, id: Not(excluirId) },
    );
  }

  existeCiudad(id: number): Promise<boolean> {
    return this.ciudades.existsBy({ id });
  }

  existeSucursal(id: number): Promise<boolean> {
    return this.sucursales.existsBy({ id });
  }

  productosPorIds(ids: number[]): Promise<Producto[]> {
    return this.productos.find({ where: { id: In(ids) } });
  }

  async tieneMovimientos(id: number): Promise<boolean> {
    return this.movimientos.existsBy({ almacen_id: id });
  }

  stockDe(almacenId: number): Promise<ProductoAlmacen[]> {
    return this.stock.find({
      where: { almacen_id: almacenId },
      relations: { producto: true },
      order: { producto: { nombre: 'ASC' } },
    });
  }

  movimientosDe(almacenId: number): Promise<MovimientoAlmacen[]> {
    return this.movimientos.find({
      where: { almacen_id: almacenId },
      relations: {
        sucursal: true,
        usuario: true,
        detalles: { producto: true },
      },
      order: { id: 'DESC', detalles: { id: 'ASC' } },
      take: 200,
    });
  }

  obtenerMovimiento(id: number): Promise<MovimientoAlmacen | null> {
    return this.movimientos.findOne({
      where: { id },
      relations: {
        almacen: true,
        sucursal: true,
        usuario: true,
        detalles: { producto: true },
      },
      order: { detalles: { id: 'ASC' } },
    });
  }

  bloquearStockAlmacen(
    manager: EntityManager,
    almacenId: number,
    productoIds: number[],
  ): Promise<ProductoAlmacen[]> {
    return manager
      .createQueryBuilder(ProductoAlmacen, 'stock')
      .setLock('pessimistic_write')
      .where('stock.almacen_id = :almacenId', { almacenId })
      .andWhere('stock.producto_id IN (:...productoIds)', { productoIds })
      .orderBy('stock.id', 'ASC')
      .getMany();
  }

  bloquearStockSucursal(
    manager: EntityManager,
    sucursalId: number,
    productoIds: number[],
  ): Promise<ProductoSucursal[]> {
    return manager
      .createQueryBuilder(ProductoSucursal, 'stock')
      .setLock('pessimistic_write')
      .where('stock.sucursal_id = :sucursalId', { sucursalId })
      .andWhere('stock.producto_id IN (:...productoIds)', { productoIds })
      .orderBy('stock.id', 'ASC')
      .getMany();
  }

  /** Suma unidades al almacen, creando la fila si el producto no estaba. */
  async sumarAlAlmacen(
    manager: EntityManager,
    almacenId: number,
    productoId: number,
    cantidad: number,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO producto_almacen (producto_id, almacen_id, cantidad)
       VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT uq_producto_almacen
       DO UPDATE SET cantidad = producto_almacen.cantidad + EXCLUDED.cantidad`,
      [productoId, almacenId, cantidad],
    );
  }

  /**
   * Suma unidades al stock de la sucursal. Si el producto no se vendia ahi, se crea
   * con el precio de lista del producto (el encargado puede ajustarlo despues).
   */
  async sumarASucursal(
    manager: EntityManager,
    sucursalId: number,
    productoId: number,
    cantidad: number,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO producto_sucursal (producto_id, sucursal_id, cantidad, cantidad_reservada, precio)
       SELECT p.id, $2, $3, 0, p.precio FROM productos p WHERE p.id = $1
       ON CONFLICT ON CONSTRAINT uq_producto_sucursal
       DO UPDATE SET cantidad = producto_sucursal.cantidad + EXCLUDED.cantidad`,
      [productoId, sucursalId, cantidad],
    );
  }

  async sucursalDeTrabajador(usuarioId: number): Promise<number | null> {
    const filas = await this.dataSource.query<{ sucursal_id: number | null }[]>(
      `SELECT sucursal_id FROM trabajador WHERE id = $1`,
      [usuarioId],
    );
    return filas[0]?.sucursal_id ?? null;
  }

  crear(datos: Partial<Almacen>): Promise<Almacen> {
    return this.almacenes.save(this.almacenes.create(datos));
  }

  guardar(almacen: Almacen): Promise<Almacen> {
    return this.almacenes.save(almacen);
  }

  async eliminar(id: number): Promise<void> {
    await this.almacenes.delete(id);
  }

  transaccion<T>(
    operacion: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(operacion);
  }
}
