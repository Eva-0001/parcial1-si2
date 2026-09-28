import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Repository } from 'typeorm';
import { Ciudad } from '../entities/ciudad.entity.js';
import { ProductoSucursal } from '../entities/producto-sucursal.entity.js';
import { TurnoCaja } from '../entities/turno-caja.entity.js';
import { Usuario } from '../entities/usuario.entity.js';
import { Venta } from '../entities/venta.entity.js';
import type { TipoVenta } from '../commons/enums/tipo-venta.enum.js';

@Injectable()
export class VentasRepository {
  constructor(
    @InjectRepository(Venta) private readonly ventas: Repository<Venta>,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(ProductoSucursal)
    private readonly stock: Repository<ProductoSucursal>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  listar(usuarioId?: number, tipoVenta?: TipoVenta): Promise<Venta[]> {
    const consulta = this.ventas
      .createQueryBuilder('venta')
      .leftJoinAndSelect('venta.envio', 'envio');

    if (usuarioId !== undefined) {
      consulta.andWhere('venta.usuario_id = :usuarioId', { usuarioId });
    }
    if (tipoVenta !== undefined) {
      consulta.andWhere('venta.tipo_venta = :tipoVenta', { tipoVenta });
    }

    return consulta.orderBy('venta.id', 'DESC').getMany();
  }

  obtener(id: number): Promise<Venta | null> {
    return this.ventas.findOne({ where: { id } });
  }

  obtenerCompleta(id: number): Promise<Venta | null> {
    return this.ventas.findOne({
      where: { id },
      relations: {
        usuario: true,
        comprobantes: true,
        turno: true,
        envio: { ciudad: true, sucursal: true, eventos: true },
        detalles: { producto_sucursal: { producto: true, sucursal: true } },
      },
      order: {
        detalles: { id: 'ASC' },
        envio: { eventos: { id: 'ASC' } },
      },
    });
  }

  existeUsuario(usuarioId: number): Promise<boolean> {
    return this.usuarios.existsBy({ id: usuarioId });
  }

  ciudad(id: number): Promise<Ciudad | null> {
    return this.ventas.manager.getRepository(Ciudad).findOne({ where: { id } });
  }

  /** Pedidos contraentrega del cliente que todavia no se entregaron ni cancelaron. */
  async contraentregasPendientes(usuarioId: number): Promise<number> {
    const filas = await this.ventas.query<{ total: number }[]>(
      `SELECT COUNT(*)::int AS total
         FROM ventas v
         JOIN envios e ON e.venta_id = v.id
        WHERE v.usuario_id = $1
          AND v.metodo_pago = 'contraentrega'
          AND e.estado NOT IN ('entregado', 'cancelado')`,
      [usuarioId],
    );
    return filas[0]?.total ?? 0;
  }

  /** Pedidos en linea pagados por QR cuyo pago la tienda todavia no verifico. */
  async qrSinVerificar(usuarioId: number): Promise<number> {
    const filas = await this.ventas.query<{ total: number }[]>(
      `SELECT COUNT(*)::int AS total
         FROM ventas
        WHERE usuario_id = $1
          AND tipo_venta = 'virtual'
          AND metodo_pago = 'qr'
          AND estado_pago = 'pendiente'
          AND cancelada_en IS NULL`,
      [usuarioId],
    );
    return filas[0]?.total ?? 0;
  }

  porIdCliente(idCliente: string): Promise<Venta | null> {
    return this.ventas.findOne({
      where: { id_cliente: idCliente },
      relations: { turno: true },
    });
  }

  pagoYaUsado(pagoId: string): Promise<boolean> {
    return this.ventas.existsBy({ pago_id: pagoId });
  }

  stockPorIds(ids: number[]): Promise<ProductoSucursal[]> {
    return this.stock.find({
      where: { id: In(ids) },
      relations: { producto: true },
    });
  }

  bloquearStock(
    manager: EntityManager,
    ids: number[],
  ): Promise<ProductoSucursal[]> {
    return manager
      .createQueryBuilder(ProductoSucursal, 'stock')
      .setLock('pessimistic_write')
      .where('stock.id IN (:...ids)', { ids })
      .orderBy('stock.id', 'ASC')
      .getMany();
  }

  /**
   * Turno abierto del cajero, bloqueado en modo compartido: varias ventas pueden
   * registrarse a la vez, pero el cierre espera a que terminen.
   */
  turnoAbiertoBloqueado(
    manager: EntityManager,
    cajeroId: number,
  ): Promise<TurnoCaja | null> {
    return manager
      .createQueryBuilder(TurnoCaja, 'turno')
      .setLock('pessimistic_read')
      .where('turno.cajero_id = :cajeroId', { cajeroId })
      .andWhere('turno.cerrado_en IS NULL')
      .getOne();
  }

  turnoBloqueado(
    manager: EntityManager,
    turnoId: number,
  ): Promise<TurnoCaja | null> {
    return manager
      .createQueryBuilder(TurnoCaja, 'turno')
      .setLock('pessimistic_read')
      .where('turno.id = :turnoId', { turnoId })
      .getOne();
  }

  transaccion<T>(
    operacion: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(operacion);
  }

  guardar(venta: Venta): Promise<Venta> {
    return this.ventas.save(venta);
  }
}
