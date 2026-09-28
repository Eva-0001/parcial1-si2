import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import type {
  EstadoEnvio,
  ModalidadEntrega,
} from '../commons/enums/envio.enum.js';
import { Envio } from '../entities/envio.entity.js';
import { Venta } from '../entities/venta.entity.js';

export interface FiltroDeEnvios {
  estado?: EstadoEnvio;
  modalidad?: ModalidadEntrega;
  sucursal_id?: number;
  activos?: boolean;
}

@Injectable()
export class EnviosRepository {
  constructor(
    @InjectRepository(Envio) private readonly envios: Repository<Envio>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  listar(filtro: FiltroDeEnvios): Promise<Envio[]> {
    const consulta = this.envios
      .createQueryBuilder('envio')
      .innerJoinAndSelect('envio.venta', 'venta')
      .leftJoinAndSelect('venta.usuario', 'cliente')
      .leftJoinAndSelect('envio.sucursal', 'sucursal')
      .leftJoinAndSelect('envio.ciudad', 'ciudad');

    if (filtro.estado !== undefined) {
      consulta.andWhere('envio.estado = :estado', { estado: filtro.estado });
    }
    if (filtro.modalidad !== undefined) {
      consulta.andWhere('envio.modalidad = :modalidad', {
        modalidad: filtro.modalidad,
      });
    }
    if (filtro.sucursal_id !== undefined) {
      consulta.andWhere('envio.sucursal_id = :sucursalId', {
        sucursalId: filtro.sucursal_id,
      });
    }
    if (filtro.activos) {
      consulta.andWhere("envio.estado NOT IN ('entregado', 'cancelado')");
    }

    return consulta.orderBy('envio.id', 'DESC').take(300).getMany();
  }

  obtener(id: number): Promise<Envio | null> {
    return this.envios.findOne({
      where: { id },
      relations: {
        venta: {
          usuario: true,
          detalles: { producto_sucursal: { producto: true } },
        },
        sucursal: true,
        ciudad: true,
        eventos: { usuario: true },
      },
      order: {
        eventos: { id: 'ASC' },
        venta: { detalles: { id: 'ASC' } },
      },
    });
  }

  /** Envio con su venta, bloqueados para cambiar de estado sin carreras. */
  async bloquear(manager: EntityManager, id: number): Promise<Envio | null> {
    const envio = await manager
      .createQueryBuilder(Envio, 'envio')
      .setLock('pessimistic_write')
      .where('envio.id = :id', { id })
      .getOne();
    if (!envio) return null;

    envio.venta = await manager.findOne(Venta, {
      where: { id: envio.venta_id },
      relations: { detalles: true },
    });
    return envio;
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
