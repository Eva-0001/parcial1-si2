import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { deCentavos, subtotalEnCentavos } from '../commons/dinero.js';
import { Rol } from '../commons/enums/rol.enum.js';
import { CodigoError, errorDeNegocio } from '../commons/errores.js';
import type { CrearCambioDto } from '../dto/cambio.dto.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { CambiosRepository, type LineaDeVenta } from '../repositories/cambios.repository.js';
import { BitacoraService } from './bitacora.service.js';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cambios de prendas: el cliente devuelve prendas de una venta dentro del
 * plazo de la empresa y se lleva otras de la misma sucursal. La prenda
 * devuelta vuelve al stock y la nueva se descuenta, en una sola transaccion.
 * La diferencia de precio queda registrada (positiva: paga el cliente;
 * negativa: saldo a favor del cliente).
 */
@Injectable()
export class CambiosService {
  constructor(
    private readonly repo: CambiosRepository,
    private readonly bitacora: BitacoraService,
  ) {}

  /** Todo lo necesario para armar el cambio de una venta: plazo, lineas y alternativas. */
  async paraVenta(ventaId: number, actor: Usuario) {
    const venta = await this.repo.venta(ventaId);
    if (!venta) throw new NotFoundException('Venta no encontrada');

    const [dias, lineas] = await Promise.all([this.repo.diasParaCambios(), this.repo.lineas(ventaId)]);
    const sucursales = [...new Set(lineas.map((l) => l.sucursal_id))];
    await this.verificarSucursal(actor, sucursales);

    const vence = new Date(new Date(venta.creada_en).getTime() + dias * DIA_MS);
    return {
      venta: {
        id: venta.id,
        fecha: venta.creada_en,
        cliente: venta.cliente,
        tipo_venta: venta.tipo_venta,
        total: venta.total,
        cancelada: venta.cancelada_en !== null,
      },
      plazo: {
        dias_para_cambios: dias,
        dias_transcurridos: venta.dias_transcurridos,
        vence_el: vence.toISOString().slice(0, 10),
        dentro_del_plazo: venta.dias_transcurridos <= dias && venta.cancelada_en === null,
      },
      lineas: lineas.map((l) => ({ ...l, disponible_para_cambio: l.cantidad - l.cambiada })),
      alternativas: sucursales.length ? await this.repo.alternativas(sucursales) : [],
    };
  }

  async crear(datos: CrearCambioDto, actor: Usuario) {
    const idCambio = await this.repo.transaccion(async (m) => {
      const venta = await this.repo.venta(datos.venta_id, m, true);
      if (!venta) throw new NotFoundException('Venta no encontrada');
      if (venta.cancelada_en) {
        throw new ConflictException('La venta esta anulada: no admite cambios');
      }

      const dias = await this.repo.diasParaCambios(m);
      if (venta.dias_transcurridos > dias) {
        throw errorDeNegocio(
          UnprocessableEntityException,
          CodigoError.FUERA_DE_PLAZO,
          `El plazo para cambios es de ${dias} dias y la venta tiene ${venta.dias_transcurridos}: ya no se puede cambiar`,
        );
      }

      const lineas = new Map((await this.repo.lineas(venta.id, m)).map((l) => [l.detalle_venta_id, l]));
      const pedido = this.validarItems(datos, lineas);
      const sucursalDelCambio = this.sucursalUnica([...pedido.values()].map((p) => p.linea));
      await this.verificarSucursal(actor, [sucursalDelCambio]);

      // Bloquea y valida el stock que sale (prendas nuevas).
      const ids = [...new Set([...pedido.values()].flatMap((p) => [p.linea.producto_sucursal_id, p.stockNuevo]))];
      const stocks = new Map((await this.repo.bloquearStock(m, ids)).map((s) => [s.id, s]));
      const salidas = new Map<number, number>();
      for (const p of pedido.values()) {
        salidas.set(p.stockNuevo, (salidas.get(p.stockNuevo) ?? 0) + p.cantidad);
      }
      for (const [stockId, cantidad] of salidas) {
        const stock = stocks.get(stockId);
        if (!stock) throw new BadRequestException(`No existe el stock ${stockId}`);
        if (stock.sucursal_id !== sucursalDelCambio) {
          throw new BadRequestException(
            'La prenda nueva tiene que ser de la misma sucursal donde se hizo la compra',
          );
        }
        const disponible = stock.cantidad - stock.cantidad_reservada;
        if (disponible < cantidad) {
          throw errorDeNegocio(
            ConflictException,
            CodigoError.SIN_STOCK,
            `Stock insuficiente de ${stock.producto}: quedan ${disponible}, se piden ${cantidad}`,
          );
        }
      }

      let devueltoCentavos = 0;
      let nuevoCentavos = 0;
      for (const p of pedido.values()) {
        devueltoCentavos += subtotalEnCentavos(p.linea.precio, p.cantidad);
        nuevoCentavos += subtotalEnCentavos(stocks.get(p.stockNuevo)!.precio, p.cantidad);
      }

      const cambioId = await this.repo.insertarCambio(m, {
        venta_id: venta.id,
        sucursal_id: sucursalDelCambio,
        usuario_id: actor.id,
        motivo: datos.motivo,
        observacion: datos.observacion?.trim() || null,
        total_devuelto: deCentavos(devueltoCentavos),
        total_nuevo: deCentavos(nuevoCentavos),
        diferencia: deCentavos(nuevoCentavos - devueltoCentavos),
      });

      for (const p of pedido.values()) {
        const nuevo = stocks.get(p.stockNuevo)!;
        await this.repo.insertarDetalle(m, {
          cambio_id: cambioId,
          detalle_venta_id: p.linea.detalle_venta_id,
          stock_devuelto_id: p.linea.producto_sucursal_id,
          stock_nuevo_id: p.stockNuevo,
          cantidad: p.cantidad,
          precio_devuelto: p.linea.precio,
          precio_nuevo: nuevo.precio,
        });
        // Entra la prenda devuelta, sale la nueva.
        await this.repo.moverStock(m, p.linea.producto_sucursal_id, p.cantidad);
        await this.repo.moverStock(m, p.stockNuevo, -p.cantidad);
        await this.bitacora.registrar(
          m,
          actor,
          `Cambio #${cambioId} (venta #${venta.id}): devuelve ${p.cantidad} unidad(es), entra al stock`,
          stocks.get(p.linea.producto_sucursal_id)?.producto ?? p.linea.producto,
        );
        await this.bitacora.registrar(
          m,
          actor,
          `Cambio #${cambioId} (venta #${venta.id}): se entrega ${p.cantidad} unidad(es), sale del stock`,
          nuevo.producto,
        );
      }
      return cambioId;
    });

    return this.obtener(idCambio);
  }

  listar(ventaId?: number) {
    return this.repo.listar(ventaId);
  }

  async obtener(id: number) {
    const [cambio] = (await this.repo.listar()).filter((c) => c.id === id);
    if (!cambio) throw new NotFoundException('Cambio no encontrado');
    return { ...cambio, detalles: await this.repo.detalles(id) };
  }

  // ------------------------------------------------------------- reglas

  /** Agrupa los items por linea y valida que no se cambie mas de lo vendido. */
  private validarItems(datos: CrearCambioDto, lineas: Map<number, LineaDeVenta>) {
    const pedido = new Map<string, { linea: LineaDeVenta; cantidad: number; stockNuevo: number }>();
    const porLinea = new Map<number, number>();

    for (const item of datos.items) {
      const linea = lineas.get(item.detalle_venta_id);
      if (!linea) {
        throw new BadRequestException(`La linea ${item.detalle_venta_id} no es de la venta #${datos.venta_id}`);
      }
      if (item.producto_sucursal_nuevo_id === linea.producto_sucursal_id) {
        throw new BadRequestException(`${linea.producto}: elegi una prenda distinta a la devuelta`);
      }
      porLinea.set(linea.detalle_venta_id, (porLinea.get(linea.detalle_venta_id) ?? 0) + item.cantidad);

      const clave = `${item.detalle_venta_id}-${item.producto_sucursal_nuevo_id}`;
      const previo = pedido.get(clave);
      pedido.set(clave, {
        linea,
        stockNuevo: item.producto_sucursal_nuevo_id,
        cantidad: (previo?.cantidad ?? 0) + item.cantidad,
      });
    }

    for (const [detalleId, cantidad] of porLinea) {
      const linea = lineas.get(detalleId)!;
      const quedan = linea.cantidad - linea.cambiada;
      if (cantidad > quedan) {
        throw new ConflictException(
          `${linea.producto}: se compraron ${linea.cantidad} y ya se cambiaron ${linea.cambiada}; ` +
            `solo se pueden cambiar ${quedan}`,
        );
      }
    }
    return pedido;
  }

  private sucursalUnica(lineas: LineaDeVenta[]): number {
    const sucursales = new Set(lineas.map((l) => l.sucursal_id));
    if (sucursales.size !== 1) {
      throw new BadRequestException('Un cambio se hace en una sola sucursal: separa las prendas por sucursal');
    }
    return lineas[0].sucursal_id;
  }

  /** Encargado y cajero solo hacen cambios en su propia sucursal. */
  private async verificarSucursal(actor: Usuario, sucursales: number[]): Promise<void> {
    if (actor.rol?.nombre === Rol.ADMINISTRADOR || sucursales.length === 0) return;
    const propia = await this.repo.sucursalDeTrabajador(actor.id);
    if (propia === null || sucursales.some((s) => s !== propia)) {
      throw new ForbiddenException('Solo podes hacer cambios de ventas de tu sucursal');
    }
  }
}
