import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TipoMovimientoAlmacen } from '../commons/enums/almacen.enum.js';
import { Rol } from '../commons/enums/rol.enum.js';
import type {
  ActualizarAlmacenDto,
  CrearAlmacenDto,
  CrearMovimientoAlmacenDto,
} from '../dto/almacen.dto.js';
import type { Almacen } from '../entities/almacen.entity.js';
import { DetalleMovimientoAlmacen } from '../entities/detalle-movimiento-almacen.entity.js';
import { MovimientoAlmacen } from '../entities/movimiento-almacen.entity.js';
import type { Producto } from '../entities/producto.entity.js';
import { ProductoAlmacen } from '../entities/producto-almacen.entity.js';
import { ProductoSucursal } from '../entities/producto-sucursal.entity.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { AlmacenesRepository } from '../repositories/almacenes.repository.js';
import { BitacoraService } from './bitacora.service.js';

const NO_ENCONTRADO = 'Almacen no encontrado';

const DESCRIPCION: Record<TipoMovimientoAlmacen, string> = {
  [TipoMovimientoAlmacen.INGRESO]: 'ingreso al almacen',
  [TipoMovimientoAlmacen.ENVIO]: 'envio a sucursal',
  [TipoMovimientoAlmacen.DEVOLUCION]: 'devolucion desde sucursal',
};

@Injectable()
export class AlmacenesService {
  constructor(
    private readonly repo: AlmacenesRepository,
    private readonly bitacora: BitacoraService,
  ) {}

  async listar() {
    const [almacenes, resumenes] = await Promise.all([
      this.repo.listar(),
      this.repo.resumenes(),
    ]);
    const porAlmacen = new Map(resumenes.map((r) => [r.almacen_id, r]));

    return almacenes.map((almacen) => ({
      ...almacen,
      productos: porAlmacen.get(almacen.id)?.productos ?? 0,
      unidades: porAlmacen.get(almacen.id)?.unidades ?? 0,
    }));
  }

  async obtener(id: number): Promise<Almacen> {
    const almacen = await this.repo.obtener(id);
    if (!almacen) throw new NotFoundException(NO_ENCONTRADO);
    return almacen;
  }

  async crear(datos: CrearAlmacenDto): Promise<Almacen> {
    await this.verificarDatos(datos);
    return this.repo.crear(datos);
  }

  async actualizar(id: number, datos: ActualizarAlmacenDto): Promise<Almacen> {
    const almacen = await this.obtener(id);
    await this.verificarDatos(datos, id);

    Object.assign(almacen, datos);
    await this.repo.guardar(almacen);
    return this.obtener(id);
  }

  async eliminar(id: number): Promise<{ mensaje: string }> {
    await this.obtener(id);

    if (await this.repo.tieneMovimientos(id)) {
      throw new ConflictException(
        'No se puede eliminar el almacen porque tiene movimientos registrados',
      );
    }

    await this.repo.eliminar(id);
    return { mensaje: 'Almacen eliminado' };
  }

  async stock(id: number): Promise<ProductoAlmacen[]> {
    await this.obtener(id);
    return this.repo.stockDe(id);
  }

  async movimientos(id: number): Promise<MovimientoAlmacen[]> {
    await this.obtener(id);
    return this.repo.movimientosDe(id);
  }

  async registrarMovimiento(
    almacenId: number,
    datos: CrearMovimientoAlmacenDto,
    actor: Usuario,
  ): Promise<MovimientoAlmacen> {
    await this.obtener(almacenId);
    const sucursalId = await this.sucursalDelMovimiento(datos, actor);

    const pedido = new Map<number, number>();
    for (const linea of datos.detalles) {
      pedido.set(
        linea.producto_id,
        (pedido.get(linea.producto_id) ?? 0) + linea.cantidad,
      );
    }

    const productos = new Map(
      (await this.repo.productosPorIds([...pedido.keys()])).map((p) => [
        p.id,
        p,
      ]),
    );
    for (const productoId of pedido.keys()) {
      if (!productos.has(productoId)) {
        throw new BadRequestException(`El producto ${productoId} no existe`);
      }
    }

    const id = await this.repo.transaccion(async (manager) => {
      switch (datos.tipo) {
        case TipoMovimientoAlmacen.INGRESO:
          for (const [productoId, cantidad] of pedido) {
            await this.repo.sumarAlAlmacen(
              manager,
              almacenId,
              productoId,
              cantidad,
            );
          }
          break;
        case TipoMovimientoAlmacen.ENVIO:
          await this.enviar(manager, almacenId, sucursalId!, pedido, productos);
          break;
        case TipoMovimientoAlmacen.DEVOLUCION:
          await this.devolver(
            manager,
            almacenId,
            sucursalId!,
            pedido,
            productos,
          );
          break;
      }

      const movimiento = await manager.getRepository(MovimientoAlmacen).save(
        manager.getRepository(MovimientoAlmacen).create({
          tipo: datos.tipo,
          almacen_id: almacenId,
          sucursal_id: sucursalId,
          usuario_id: actor.id,
          observacion: datos.observacion?.trim() || null,
          detalles: [...pedido].map(([productoId, cantidad]) =>
            manager
              .getRepository(DetalleMovimientoAlmacen)
              .create({ producto_id: productoId, cantidad }),
          ),
        }),
      );

      for (const [productoId, cantidad] of pedido) {
        await this.bitacora.registrar(
          manager,
          actor,
          `Almacen #${almacenId}, movimiento #${movimiento.id}: ${DESCRIPCION[datos.tipo]} de ${cantidad} unidad(es)`,
          productos.get(productoId)?.nombre ?? null,
        );
      }

      return movimiento.id;
    });

    return (await this.repo.obtenerMovimiento(id))!;
  }

  private async enviar(
    manager: EntityManager,
    almacenId: number,
    sucursalId: number,
    pedido: Map<number, number>,
    productos: Map<number, Producto>,
  ): Promise<void> {
    const filas = await this.repo.bloquearStockAlmacen(manager, almacenId, [
      ...pedido.keys(),
    ]);
    const enAlmacen = new Map(filas.map((fila) => [fila.producto_id, fila]));

    for (const [productoId, cantidad] of pedido) {
      const fila = enAlmacen.get(productoId);
      const hay = fila?.cantidad ?? 0;
      if (!fila || hay < cantidad) {
        throw new ConflictException(
          `Stock insuficiente en el almacen para "${productos.get(productoId)?.nombre}": ` +
            `hay ${hay}, se piden ${cantidad}`,
        );
      }
      fila.cantidad -= cantidad;
      await manager.getRepository(ProductoAlmacen).save(fila);
      await this.repo.sumarASucursal(manager, sucursalId, productoId, cantidad);
    }
  }

  private async devolver(
    manager: EntityManager,
    almacenId: number,
    sucursalId: number,
    pedido: Map<number, number>,
    productos: Map<number, Producto>,
  ): Promise<void> {
    const filas = await this.repo.bloquearStockSucursal(manager, sucursalId, [
      ...pedido.keys(),
    ]);
    const enSucursal = new Map(filas.map((fila) => [fila.producto_id, fila]));

    for (const [productoId, cantidad] of pedido) {
      const fila = enSucursal.get(productoId);
      // Lo reservado por clientes no se puede devolver.
      const disponible = fila ? fila.cantidad - fila.cantidad_reservada : 0;
      if (!fila || disponible < cantidad) {
        throw new ConflictException(
          `Stock disponible insuficiente en la sucursal para "${productos.get(productoId)?.nombre}": ` +
            `hay ${disponible}, se piden ${cantidad}`,
        );
      }
      fila.cantidad -= cantidad;
      await manager.getRepository(ProductoSucursal).save(fila);
      await this.repo.sumarAlAlmacen(manager, almacenId, productoId, cantidad);
    }
  }

  /**
   * Sucursal involucrada: ninguna en un ingreso, obligatoria en envios y devoluciones.
   * El encargado solo mueve stock de su propia sucursal y no registra ingresos.
   */
  private async sucursalDelMovimiento(
    datos: CrearMovimientoAlmacenDto,
    actor: Usuario,
  ): Promise<number | null> {
    const esEncargado = actor.rol?.nombre === Rol.ENCARGADO;

    if (datos.tipo === TipoMovimientoAlmacen.INGRESO) {
      if (esEncargado) {
        throw new ForbiddenException(
          'Solo el administrador registra ingresos de mercaderia al almacen',
        );
      }
      return null;
    }

    if (datos.sucursal_id === undefined) {
      throw new BadRequestException(
        'Indica la sucursal de destino u origen del movimiento',
      );
    }
    if (!(await this.repo.existeSucursal(datos.sucursal_id))) {
      throw new BadRequestException('La sucursal no existe');
    }
    if (esEncargado) {
      const propia = await this.repo.sucursalDeTrabajador(actor.id);
      if (propia !== datos.sucursal_id) {
        throw new ForbiddenException(
          'Solo podes mover stock entre el almacen y tu sucursal',
        );
      }
    }
    return datos.sucursal_id;
  }

  private async verificarDatos(
    datos: ActualizarAlmacenDto,
    excluirId?: number,
  ): Promise<void> {
    if (
      datos.nombre !== undefined &&
      (await this.repo.nombreOcupado(datos.nombre.trim(), excluirId))
    ) {
      throw new ConflictException('Ya existe un almacen con ese nombre');
    }
    if (
      datos.ciudad_id !== undefined &&
      !(await this.repo.existeCiudad(datos.ciudad_id))
    ) {
      throw new BadRequestException('La ciudad no existe');
    }
  }
}
