import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type EntityManager, IsNull } from 'typeorm';
import { MetodoPago, TipoMovimientoCaja } from '../commons/enums/caja.enum.js';
import {
  ESTADOS_FINALES,
  EstadoEnvio,
  EstadoPago,
  FLUJO_DE_ENVIO,
} from '../commons/enums/envio.enum.js';
import { Rol } from '../commons/enums/rol.enum.js';
import type {
  AvanzarEnvioDto,
  CancelarEnvioDto,
  FiltroEnviosDto,
} from '../dto/envio.dto.js';
import { Envio } from '../entities/envio.entity.js';
import { EventoEnvio } from '../entities/evento-envio.entity.js';
import { MovimientoCaja } from '../entities/movimiento-caja.entity.js';
import { TurnoCaja } from '../entities/turno-caja.entity.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { Venta } from '../entities/venta.entity.js';
import { EnviosRepository } from '../repositories/envios.repository.js';
import { ArchivosService } from '../commons/archivos/archivos.service.js';
import { BitacoraService } from './bitacora.service.js';
import { PagosService } from './pagos.service.js';
import { VentasService } from './ventas.service.js';

const NO_ENCONTRADO = 'Pedido no encontrado';

const ETIQUETA: Record<EstadoEnvio, string> = {
  [EstadoEnvio.PENDIENTE]: 'pendiente',
  [EstadoEnvio.PREPARANDO]: 'en preparacion',
  [EstadoEnvio.EN_CAMINO]: 'en camino',
  [EstadoEnvio.LISTO_RETIRO]: 'listo para retirar',
  [EstadoEnvio.ENTREGADO]: 'entregado',
  [EstadoEnvio.CANCELADO]: 'cancelado',
};

@Injectable()
export class EnviosService {
  constructor(
    private readonly repo: EnviosRepository,
    private readonly ventas: VentasService,
    private readonly pagos: PagosService,
    private readonly bitacora: BitacoraService,
    private readonly archivos: ArchivosService,
  ) {}

  async listar(filtro: FiltroEnviosDto, actor: Usuario): Promise<Envio[]> {
    const sucursalId = this.esEncargado(actor)
      ? await this.sucursalPropia(actor, filtro.sucursal_id)
      : filtro.sucursal_id;
    return this.repo.listar({ ...filtro, sucursal_id: sucursalId });
  }

  async obtener(id: number, actor: Usuario): Promise<Envio> {
    const envio = await this.repo.obtener(id);
    if (!envio) throw new NotFoundException(NO_ENCONTRADO);
    if (this.esEncargado(actor)) {
      await this.sucursalPropia(actor, envio.sucursal_id);
    }
    return envio;
  }

  /** Pasa el pedido al siguiente estado de su flujo (retiro o domicilio). */
  async avanzar(
    id: number,
    datos: AvanzarEnvioDto,
    actor: Usuario,
  ): Promise<Envio> {
    await this.repo.transaccion(async (manager) => {
      const envio = await this.bloquear(manager, id);
      if (this.esEncargado(actor)) {
        await this.sucursalPropia(actor, envio.sucursal_id);
      }
      this.exigirActivo(envio);

      const siguiente = FLUJO_DE_ENVIO[envio.modalidad][envio.estado];
      if (datos.estado !== siguiente) {
        throw new ConflictException(
          `El pedido esta ${ETIQUETA[envio.estado]}: el siguiente paso es "${
            siguiente ? ETIQUETA[siguiente] : 'ninguno'
          }"`,
        );
      }

      if (this.qrSinVerificar(envio.venta!)) {
        throw new ConflictException(
          'El pago por QR todavia no esta verificado: confirmalo antes de preparar el pedido',
        );
      }

      envio.estado = siguiente;
      await manager.getRepository(Envio).save(envio);
      if (siguiente === EstadoEnvio.ENTREGADO) {
        await manager
          .getRepository(Envio)
          .update({ id: envio.id }, { entregado_en: () => 'now()' });
        await this.cobrarContraentrega(manager, envio.venta!);
      }

      await this.registrarEvento(manager, envio, datos.nota ?? null, actor);
      await this.bitacora.registrar(
        manager,
        actor,
        `Pedido #${envio.venta_id}: ${ETIQUETA[siguiente]}`,
      );
    });

    return this.obtener(id, actor);
  }

  /**
   * Cancela el pedido y devuelve el stock. El cliente solo puede mientras esta pendiente;
   * el personal, en cualquier estado antes de entregarlo. Si se pago con tarjeta, se reembolsa.
   */
  async cancelar(
    id: number,
    datos: CancelarEnvioDto,
    actor: Usuario,
  ): Promise<{ mensaje: string; reembolsado: boolean }> {
    const esCliente = actor.rol?.nombre === Rol.CLIENTE;
    let reembolsado = false;

    await this.repo.transaccion(async (manager) => {
      const envio = await this.bloquear(manager, id);
      const venta = envio.venta!;

      if (esCliente) {
        if (venta.usuario_id !== actor.id) {
          throw new ForbiddenException('Ese pedido no es tuyo');
        }
        if (envio.estado !== EstadoEnvio.PENDIENTE) {
          throw new ConflictException(
            `El pedido ya esta ${ETIQUETA[envio.estado]}: para cancelarlo comunicate con la tienda`,
          );
        }
      } else if (this.esEncargado(actor)) {
        await this.sucursalPropia(actor, envio.sucursal_id);
      }
      this.exigirActivo(envio);

      const motivo = datos.motivo.trim();
      await this.ventas.reingresarStock(
        manager,
        venta.detalles ?? [],
        actor,
        `Cancelacion pedido #${venta.id}`,
      );

      envio.estado = EstadoEnvio.CANCELADO;
      envio.motivo_cancelacion = motivo;
      await manager.getRepository(Envio).save(envio);

      await manager
        .getRepository(Venta)
        .update({ id: venta.id }, { cancelada_en: () => 'now()' });

      let nota = motivo;
      if (
        venta.metodo_pago === MetodoPago.QR &&
        !venta.pago_id &&
        venta.estado_pago === EstadoPago.PAGADO
      ) {
        nota += ' (el pago por QR se devuelve manualmente)';
      }
      await this.registrarEvento(manager, envio, nota, actor);
      await this.bitacora.registrar(
        manager,
        actor,
        `Pedido #${venta.id} cancelado: ${motivo}`,
      );

      // El reembolso va al final: si Stripe falla, la transaccion se revierte entera.
      if (venta.pago_id && venta.estado_pago === EstadoPago.PAGADO) {
        await this.pagos.reembolsar(venta.pago_id, motivo);
        await manager
          .getRepository(Venta)
          .update({ id: venta.id }, { estado_pago: EstadoPago.REEMBOLSADO });
        reembolsado = true;
      }
    });

    return {
      mensaje: reembolsado
        ? 'Pedido cancelado: el stock volvio y el pago fue reembolsado'
        : 'Pedido cancelado: el stock volvio a la sucursal',
      reembolsado,
    };
  }

  /** El personal vio el deposito del QR en la cuenta de la tienda: el pago queda confirmado. */
  async confirmarPagoQr(id: number, actor: Usuario): Promise<Envio> {
    await this.repo.transaccion(async (manager) => {
      const envio = await this.bloquear(manager, id);
      if (this.esEncargado(actor)) {
        await this.sucursalPropia(actor, envio.sucursal_id);
      }
      this.exigirActivo(envio);

      const venta = envio.venta!;
      if (!this.qrSinVerificar(venta)) {
        throw new ConflictException(
          'Este pedido no tiene un pago QR por verificar',
        );
      }
      if (!venta.comprobante_pago) {
        throw new ConflictException(
          'El cliente todavia no subio el comprobante del pago',
        );
      }

      await manager
        .getRepository(Venta)
        .update({ id: venta.id }, { estado_pago: EstadoPago.PAGADO });
      await this.registrarEvento(manager, envio, 'Pago QR verificado', actor);
      await this.bitacora.registrar(
        manager,
        actor,
        `Pedido #${venta.id}: pago QR verificado`,
      );
    });

    return this.obtener(id, actor);
  }

  /**
   * El comprobante no es valido (ilegible, monto distinto...): se descarta y el cliente
   * puede subir otro. El pedido sigue apartando el stock hasta que se cancele.
   */
  async rechazarComprobante(
    id: number,
    motivo: string,
    actor: Usuario,
  ): Promise<Envio> {
    let descartado: string | null = null;
    await this.repo.transaccion(async (manager) => {
      const envio = await this.bloquear(manager, id);
      if (this.esEncargado(actor)) {
        await this.sucursalPropia(actor, envio.sucursal_id);
      }
      this.exigirActivo(envio);

      const venta = envio.venta!;
      if (!this.qrSinVerificar(venta) || !venta.comprobante_pago) {
        throw new ConflictException(
          'No hay un comprobante de pago por revisar',
        );
      }
      descartado = venta.comprobante_pago;

      await manager
        .getRepository(Venta)
        .update({ id: venta.id }, { comprobante_pago: null });
      await this.registrarEvento(
        manager,
        envio,
        `Comprobante rechazado: ${motivo.trim()}`,
        actor,
      );
      await this.bitacora.registrar(
        manager,
        actor,
        `Pedido #${venta.id}: comprobante de pago QR rechazado (${motivo.trim()})`,
      );
    });
    await this.archivos.eliminarPrivado(descartado);

    return this.obtener(id, actor);
  }

  private qrSinVerificar(venta: Venta): boolean {
    return (
      venta.metodo_pago === MetodoPago.QR &&
      venta.estado_pago === EstadoPago.PENDIENTE
    );
  }

  /**
   * Cobro de un pedido contraentrega: el cliente pago al recibir (repartidor) o al retirar
   * en la tienda. El pago queda cobrado y el pedido entregado: la venta queda completada.
   * Si lo cobra un cajero con turno abierto en esa sucursal, entra como ingreso de su caja.
   */
  async completarContraentrega(id: number, actor: Usuario): Promise<Envio> {
    await this.repo.transaccion(async (manager) => {
      const envio = await this.bloquear(manager, id);
      if (this.esEncargado(actor)) {
        await this.sucursalPropia(actor, envio.sucursal_id);
      }
      this.exigirActivo(envio);

      const venta = envio.venta!;
      if (
        venta.metodo_pago !== MetodoPago.CONTRAENTREGA ||
        venta.estado_pago !== EstadoPago.PENDIENTE
      ) {
        throw new ConflictException(
          'Este pedido no tiene un cobro contraentrega pendiente',
        );
      }

      await manager
        .getRepository(Venta)
        .update({ id: venta.id }, { estado_pago: EstadoPago.PAGADO });
      envio.estado = EstadoEnvio.ENTREGADO;
      await manager.getRepository(Envio).save(envio);
      await manager
        .getRepository(Envio)
        .update({ id: envio.id }, { entregado_en: () => 'now()' });

      const turno = await manager
        .getRepository(TurnoCaja)
        .findOne({ where: { cajero_id: actor.id, cerrado_en: IsNull() } });
      const enCaja = turno?.sucursal_id === envio.sucursal_id;
      if (turno && enCaja) {
        await manager.getRepository(MovimientoCaja).save(
          manager.getRepository(MovimientoCaja).create({
            turno_id: turno.id,
            tipo: TipoMovimientoCaja.INGRESO,
            monto: venta.total,
            motivo: `Cobro contraentrega del pedido #${venta.id}`,
            usuario_id: actor.id,
          }),
        );
      }

      await this.registrarEvento(
        manager,
        envio,
        `Cobro contraentrega recibido: venta completada${enCaja ? ` (ingreso en el turno #${turno!.id})` : ''}`,
        actor,
      );
      await this.bitacora.registrar(
        manager,
        actor,
        `Pedido #${venta.id}: cobro contraentrega de Bs ${venta.total}, venta completada`,
      );
    });

    return this.obtener(id, actor);
  }

  /** El repartidor cobra en efectivo al entregar: el pago queda confirmado. */
  private async cobrarContraentrega(
    manager: EntityManager,
    venta: Venta,
  ): Promise<void> {
    if (
      venta.metodo_pago === MetodoPago.CONTRAENTREGA &&
      venta.estado_pago === EstadoPago.PENDIENTE
    ) {
      venta.estado_pago = EstadoPago.PAGADO;
      await manager
        .getRepository(Venta)
        .update({ id: venta.id }, { estado_pago: EstadoPago.PAGADO });
    }
  }

  private async registrarEvento(
    manager: EntityManager,
    envio: Envio,
    nota: string | null,
    actor: Usuario,
  ): Promise<void> {
    await manager.getRepository(EventoEnvio).save(
      manager.getRepository(EventoEnvio).create({
        envio_id: envio.id,
        estado: envio.estado,
        nota: nota?.trim() || null,
        usuario_id: actor.id,
      }),
    );
  }

  private async bloquear(manager: EntityManager, id: number): Promise<Envio> {
    const envio = await this.repo.bloquear(manager, id);
    if (!envio || !envio.venta) throw new NotFoundException(NO_ENCONTRADO);
    return envio;
  }

  private exigirActivo(envio: Envio): void {
    if (ESTADOS_FINALES.includes(envio.estado)) {
      throw new ConflictException(
        `El pedido ya esta ${ETIQUETA[envio.estado]}: no admite cambios`,
      );
    }
  }

  private async sucursalPropia(
    actor: Usuario,
    pedida?: number,
  ): Promise<number> {
    const propia = await this.repo.sucursalDeTrabajador(actor.id);
    if (propia === null) {
      throw new ForbiddenException(
        'No tenes una sucursal asignada: pedile al administrador que te asigne una',
      );
    }
    if (pedida !== undefined && pedida !== propia) {
      throw new ForbiddenException(
        'Solo podes gestionar pedidos de tu sucursal',
      );
    }
    return propia;
  }

  /** Encargado y cajero solo gestionan pedidos de la sucursal de su ficha de trabajador. */
  private esEncargado(usuario: Usuario): boolean {
    const rol = usuario.rol?.nombre;
    return rol === Rol.ENCARGADO || rol === Rol.CAJERO;
  }
}
