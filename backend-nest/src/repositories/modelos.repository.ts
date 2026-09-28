import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { Color } from '../entities/color.entity.js';
import { Modelo } from '../entities/modelo.entity.js';
import { Talla } from '../entities/talla.entity.js';

export interface FiltroDeModelos {
  nombre?: string;
  categoria_id?: number;
  proveedor_id?: number;
}

export interface StockDeModelo {
  modelo_id: number;
  stock: number;
}

@Injectable()
export class ModelosRepository {
  constructor(
    @InjectRepository(Modelo) private readonly modelos: Repository<Modelo>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  listar(filtro: FiltroDeModelos): Promise<Modelo[]> {
    const consulta = this.modelos
      .createQueryBuilder('modelo')
      .leftJoinAndSelect('modelo.variantes', 'variante');

    if (filtro.nombre) {
      consulta.andWhere('modelo.nombre ILIKE :nombre', {
        nombre: `%${filtro.nombre}%`,
      });
    }
    if (filtro.categoria_id !== undefined) {
      consulta.andWhere('modelo.categoria_id = :categoriaId', {
        categoriaId: filtro.categoria_id,
      });
    }
    if (filtro.proveedor_id !== undefined) {
      consulta.andWhere('modelo.proveedor_id = :proveedorId', {
        proveedorId: filtro.proveedor_id,
      });
    }

    return consulta
      .orderBy('modelo.nombre', 'ASC')
      .addOrderBy('variante.id', 'ASC')
      .getMany();
  }

  /** Unidades en todas las sucursales, por modelo. */
  stockPorModelo(): Promise<StockDeModelo[]> {
    return this.dataSource.query<StockDeModelo[]>(
      `SELECT p.modelo_id, COALESCE(SUM(ps.cantidad), 0)::int AS stock
         FROM productos p
         LEFT JOIN producto_sucursal ps ON ps.producto_id = p.id
        GROUP BY p.modelo_id`,
    );
  }

  obtener(id: number): Promise<Modelo | null> {
    return this.modelos.findOne({
      where: { id },
      relations: {
        categoria: true,
        coleccion: true,
        temporada: true,
        proveedor: true,
        variantes: { color: true, talla: true },
      },
      order: { variantes: { id: 'ASC' } },
    });
  }

  /** Nombres de color y talla para armar el nombre de la variante. */
  async nombres(
    colorId: number | null | undefined,
    tallaId: number | null | undefined,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<{ color: string | null; talla: string | null }> {
    const [color, talla] = await Promise.all([
      colorId ? manager.findOne(Color, { where: { id: colorId } }) : null,
      tallaId ? manager.findOne(Talla, { where: { id: tallaId } }) : null,
    ]);
    return { color: color?.nombre ?? null, talla: talla?.nombre ?? null };
  }

  transaccion<T>(
    operacion: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(operacion);
  }
}
