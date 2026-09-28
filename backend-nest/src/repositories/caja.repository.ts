import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, IsNull, Repository } from 'typeorm';
import type {
  MetodoPago,
  TipoMovimientoCaja,
} from '../commons/enums/caja.enum.js';
import { MovimientoCaja } from '../entities/movimiento-caja.entity.js';
import { Sucursal } from '../entities/sucursal.entity.js';
import { TurnoCaja } from '../entities/turno-caja.entity.js';
import { Venta } from '../entities/venta.entity.js';

export interface FiltroDeTurnos {
  sucursal_id?: number;
  cajero_id?: number;
  desde?: string;
  hasta?: string;
}

export interface TotalesDeTurno {
  ventas: { metodo_pago: MetodoPago | null; cantidad: number; total: string }[];
  movimientos: { tipo: TipoMovimientoCaja; total: string }[];
}

@Injectable()
export class CajaRepository {
  constructor(
    @InjectRepository(TurnoCaja)
    private readonly turnos: Repository<TurnoCaja>,
    @InjectRepository(MovimientoCaja)
    private readonly movimientos: Repository<MovimientoCaja>,
    @InjectRepository(Venta) private readonly ventas: Repository<Venta>,
    @InjectRepository(Sucursal)
    private readonly sucursales: Repository<Sucursal>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  listar(filtro: FiltroDeTurnos): Promise<TurnoCaja[]> {
    const consulta = this.turnos
      .createQueryBuilder('turno')
      .leftJoinAndSelect('turno.sucursal', 'sucursal')
      .leftJoinAndSelect('turno.cajero', 'cajero');

    if (filtro.sucursal_id !== undefined) {
      consulta.andWhere('turno.sucursal_id = :sucursalId', {
        sucursalId: filtro.sucursal_id,
      });
    }
    if (filtro.cajero_id !== undefined) {
      consulta.andWhere('turno.cajero_id = :cajeroId', {
        cajeroId: filtro.cajero_id,
      });
    }
    if (filtro.desde) {
      consulta.andWhere('turno.abierto_en >= CAST(:desde AS date)', {
        desde: filtro.desde,
      });
    }
    if (filtro.hasta) {
      consulta.andWhere(
        "turno.abierto_en < CAST(:hasta AS date) + INTERVAL '1 day'",
        { hasta: filtro.hasta },
      );
    }

    return consulta.orderBy('turno.id', 'DESC').getMany();
  }

  obtener(id: number): Promise<TurnoCaja | null> {
    return this.turnos.findOne({
      where: { id },
      relations: { sucursal: true, cajero: true },
    });
  }

  abiertoDe(cajeroId: number): Promise<TurnoCaja | null> {
    return this.turnos.findOne({
      where: { cajero_id: cajeroId, cerrado_en: IsNull() },
      relations: { sucursal: true, cajero: true },
    });
  }

  bloquear(manager: EntityManager, id: number): Promise<TurnoCaja | null> {
    return manager
      .createQueryBuilder(TurnoCaja, 'turno')
      .setLock('pessimistic_write')
      .where('turno.id = :id', { id })
      .getOne();
  }

  movimientosDe(turnoId: number): Promise<MovimientoCaja[]> {
    return this.movimientos.find({
      where: { turno_id: turnoId },
      relations: { usuario: true },
      order: { id: 'ASC' },
    });
  }

  ventasDe(turnoId: number): Promise<Venta[]> {
    return this.ventas.find({
      where: { turno_id: turnoId },
      relations: { usuario: true },
      order: { id: 'ASC' },
    });
  }

  /** Suma de ventas por metodo y de movimientos por tipo. Acepta un manager para leer dentro de una transaccion. */
  async totales(
    turnoId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TotalesDeTurno> {
    const [ventas, movimientos] = await Promise.all([
      manager.query<TotalesDeTurno['ventas']>(
        `SELECT metodo_pago, COUNT(*)::int AS cantidad, COALESCE(SUM(total), 0)::text AS total
           FROM ventas
          WHERE turno_id = $1
          GROUP BY metodo_pago`,
        [turnoId],
      ),
      manager.query<TotalesDeTurno['movimientos']>(
        `SELECT tipo, COALESCE(SUM(monto), 0)::text AS total
           FROM movimientos_caja
          WHERE turno_id = $1
          GROUP BY tipo`,
        [turnoId],
      ),
    ]);
    return { ventas, movimientos };
  }

  existeSucursal(id: number): Promise<boolean> {
    return this.sucursales.existsBy({ id });
  }

  async sucursalDeTrabajador(usuarioId: number): Promise<number | null> {
    const filas = await this.dataSource.query<{ sucursal_id: number | null }[]>(
      `SELECT sucursal_id FROM trabajador WHERE id = $1`,
      [usuarioId],
    );
    return filas[0]?.sucursal_id ?? null;
  }

  transaccion<T>(
    operacion: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(operacion);
  }
}
