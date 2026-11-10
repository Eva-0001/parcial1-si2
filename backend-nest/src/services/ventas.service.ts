import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EntityManager, QueryFailedError } from 'typeorm';
import {
  aCentavos,
  deCentavos,
  subtotalEnCentavos,
} from '../commons/dinero.js';
import { METODOS_DE_CAJA, MetodoPago } from '../commons/enums/caja.enum.js';
import {
  EstadoEnvio,
  EstadoPago,
  ModalidadEntrega,
} from '../commons/enums/envio.enum.js';
import { Rol } from '../commons/enums/rol.enum.js';
import { ModalidadVenta, TipoVenta } from '../commons/enums/tipo-venta.enum.js';
import { CodigoError, errorDeNegocio } from '../commons/errores.js';
import {
  aplicarPrecios,
  MINIMO_MAYOR_POR_DEFECTO,
  type PrecioAplicado,
} from '../commons/precios.js';
import type { Configuracion } from '../config/configuracion.js';
import type {
  ActualizarVentaDto,
  CrearVentaDto,
  DetalleDeVentaDto,
  EntregaDto,
  FiltroVentasDto,
} from '../dto/venta.dto.js';
import { DetalleVenta } from '../entities/detalle-venta.entity.js';
import { Envio } from '../entities/envio.entity.js';
import { EventoEnvio } from '../entities/evento-envio.entity.js';
import { ProductoSucursal } from '../entities/producto-sucursal.entity.js';
import type { TurnoCaja } from '../entities/turno-caja.entity.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { Venta } from '../entities/venta.entity.js';
import { VentasRepository } from '../repositories/ventas.repository.js';
import { ArchivosService } from '../commons/archivos/archivos.service.js';
import { verificarPassword } from '../commons/passwords.js';
import { BitacoraService } from './bitacora.service.js';
import { PagosService } from './pagos.service.js';

const NO_ENCONTRADA = 'Venta no encontrada';
const VIOLACION_DE_UNICIDAD = '23505';

const RETIRO: EntregaDto = { modalidad: ModalidadEntrega.RETIRO };

@Injectable()
export class VentasService {
  private readonly contraentregaPendientesMax: number;
  private readonly qrPendientesMax: number;

  constructor(
    private readonly repo: VentasRepository,
    private readonly pagos: PagosService,
    private readonly bitacora: BitacoraService,
    private readonly archivos: ArchivosService,
    config: ConfigService<Configuracion, true>,
  ) {
    const envios = config.get('envios', { infer: true });
    this.contraentregaPendientesMax = envios.contraentregaPendientesMax;
    this.qrPendientesMax = envios.qrPendientesMax;
  }

  listar(filtro: FiltroVentasDto, actor: Usuario): Promise<Venta[]> {
    const usuarioId = this.esCliente(actor) ? actor.id : filtro.usuario_id;
    return this.repo.listar(usuarioId, filtro.tipo_venta);
  }

  async obtener(id: number, actor: Usuario): Promise<Venta> {
    const venta = await this.repo.obtenerCompleta(id);
    if (!venta) throw new NotFoundException(NO_ENCONTRADA);

    if (this.esCliente(actor) && venta.usuario_id !== actor.id) {
      throw new ForbiddenException('Esa venta no es tuya');
    }

    return venta;
  }

  async crear(datos: CrearVentaDto, actor: Usuario): Promise<Venta> {
    const esCliente = this.esCliente(actor);
    const usuarioId = esCliente ? actor.id : datos.usuario_id;

    if (!(await this.repo.existeUsuario(usuarioId))) {
      throw new BadRequestException('El usuario no existe');
    }

    // Reintento de una venta ya registrada (por ejemplo, la cola offline del POS).
    if (datos.id_cliente) {
      const previa = await this.ventaYaRegistrada(
        datos.id_cliente,
        actor,
        usuarioId,
      );
      if (previa) return previa;
    }

    this.verificarReglasDePago(datos, esCliente);
    const presencial = datos.tipo_venta === TipoVenta.PRESENCIAL;
    const entrega = presencial ? null : (datos.entrega ?? RETIRO);
    const metodoPago = datos.pago_id
      ? MetodoPago.TARJETA
      : (datos.metodo_pago ?? null);
    const contraentrega = metodoPago === MetodoPago.CONTRAENTREGA;

    // Pedido en linea pagado por QR: el pago queda por verificar hasta que la tienda lo confirme.
    const qrPorVerificar = !presencial && metodoPago === MetodoPago.QR;
    if (qrPorVerificar) {
      await this.verificarLimiteDeQr(usuarioId);
    }
    if (contraentrega) {
      await this.verificarLimiteDeContraentrega(usuarioId);
    }
    const costoEnvio = entrega ? await this.costoDeEnvio(entrega) : 0;

    let totalVerificado: string | null = null;
    if (datos.pago_id) {
      if (await this.repo.pagoYaUsado(datos.pago_id)) {
        throw new ConflictException('Ese pago ya esta asociado a otra venta');
      }
      totalVerificado = await this.totalDe(datos.detalles, entrega);
      await this.pagos.verificar(datos.pago_id, totalVerificado);
    }

    let venta: Venta;
    try {
      venta = await this.registrar(
        datos,
        actor,
        usuarioId,
        entrega,
        metodoPago,
        costoEnvio,
        totalVerificado,
      );
    } catch (error) {
      if (datos.id_cliente && this.esDuplicada(error)) {
        const previa = await this.ventaYaRegistrada(
          datos.id_cliente,
          actor,
          usuarioId,
        );
        if (previa) return previa;
      }
      throw error;
    }

    if (datos.pago_id) {
      await this.pagos.marcarVenta(datos.pago_id, venta.id);
    }

    return (await this.repo.obtenerCompleta(venta.id)) ?? venta;
  }

  private registrar(
    datos: CrearVentaDto,
    actor: Usuario,
    usuarioId: number,
    entrega: EntregaDto | null,
    metodoPago: MetodoPago | null,
    costoEnvio: number,
    totalVerificado: string | null,
  ): Promise<Venta> {
    const presencial = datos.tipo_venta === TipoVenta.PRESENCIAL;
    const contraentrega = metodoPago === MetodoPago.CONTRAENTREGA;
    // Contraentrega se cobra al entregar; el QR en linea, cuando la tienda verifica el deposito.
    const pagoPendiente =
      contraentrega || (!presencial && metodoPago === MetodoPago.QR);

    return this.repo.transaccion(async (manager) => {
      const turno = presencial
        ? await this.turnoParaCobrar(manager, actor)
        : null;

      const pedido = this.agruparPorStock(datos.detalles);
      const stocks = await this.bloquearYValidar(manager, pedido);

      if (turno !== null) {
        this.verificarSucursalDelTurno(turno.sucursal_id, stocks);
      }
      const sucursalDespacho = entrega ? this.sucursalUnica(stocks) : null;

      const precios = this.preciosDelPedido(pedido, stocks);
      // Venta hecha sin conexion: se respetan (o se discuten) los precios que se cobraron.
      const autorizadoPor = await this.aplicarPreciosCobrados(
        manager,

        datos,
        actor,
        precios,
        stocks,
      );
      let totalCentavos = costoEnvio;
      for (const [stockId, cantidad] of pedido) {
        totalCentavos += subtotalEnCentavos(
          precios.get(stockId)!.precio,
          cantidad,
        );
      }
      const total = deCentavos(totalCentavos);
      const porMayor = [...precios.values()].some((p) => p.por_mayor);

      if (totalVerificado !== null && total !== totalVerificado) {
        throw new ConflictException(
          'Los precios cambiaron mientras se procesaba el pago. No se registro la venta.',
        );
      }

      const venta = await manager.getRepository(Venta).save(
        manager.getRepository(Venta).create({
          tipo_venta: datos.tipo_venta,
          modalidad: porMayor ? ModalidadVenta.MAYOR : ModalidadVenta.MENOR,
          usuario_id: usuarioId,
          total,
          pago_id: datos.pago_id ?? null,
          metodo_pago: metodoPago,
          estado_pago: pagoPendiente ? EstadoPago.PENDIENTE : EstadoPago.PAGADO,
          turno_id: turno?.id ?? null,
          id_cliente: datos.id_cliente ?? null,
          origen: turno && datos.registrada_en ? 'sin_conexion' : 'en_linea',
          precios_autorizados_por: autorizadoPor,
        }),
      );

      if (turno && datos.registrada_en) {
        await this.fijarMomentoDeCobro(
          manager,
          venta.id,
          turno.id,
          datos.registrada_en,
        );
      }

      for (const [stockId, cantidad] of pedido) {
        const stock = stocks.get(stockId)!;

        await manager.getRepository(DetalleVenta).save(
          manager.getRepository(DetalleVenta).create({
            venta_id: venta.id,
            producto_sucursal_id: stock.id,
            cantidad,
            precio: precios.get(stockId)!.precio,
            precio_lista: stock.precio,
          }),
        );

        stock.cantidad -= cantidad;
        await manager.getRepository(ProductoSucursal).save(stock);

        await this.bitacora.registrar(
          manager,
          actor,
          `Venta #${venta.id}: salida de ${cantidad} unidad(es)`,
          stock.producto?.nombre ?? null,
        );
      }

      if (entrega && sucursalDespacho !== null) {
        await this.crearEnvio(
          manager,
          venta.id,
          entrega,
          sucursalDespacho,
          costoEnvio,
          actor,
        );
      }

      return venta;
    });
  }

  /**
   * Venta ya guardada con ese id_cliente. Solo la devuelve a quien la registro
   * (el cajero del turno o el mismo comprador); si no, es un UUID ajeno.
   */
  private async ventaYaRegistrada(
    idCliente: string,
    actor: Usuario,
    usuarioId: number,
  ): Promise<Venta | null> {
    const previa = await this.repo.porIdCliente(idCliente);
    if (!previa) return null;

    const propia = previa.turno
      ? previa.turno.cajero_id === actor.id
      : previa.usuario_id === usuarioId;
    if (!propia) {
      throw new ConflictException('Ese id_cliente ya pertenece a otra venta');
    }
    return (await this.repo.obtenerCompleta(previa.id)) ?? previa;
  }

  /**
   * Hora real de una venta cobrada sin conexion, acotada al turno: no antes de que
   * abriera ni despues de ahora (el reloj del equipo puede estar desfasado).
   * La calcula Postgres para usar la misma zona horaria que los DEFAULT now().
   */
  private async fijarMomentoDeCobro(
    manager: EntityManager,
    ventaId: number,
    turnoId: number,
    registradaEn: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Venta)
      .set({
        creada_en: () =>
          `LEAST(now()::timestamp, GREATEST(
             (SELECT abierto_en FROM turnos_caja WHERE id = :turnoId),
             CAST(:registradaEn AS timestamptz)::timestamp))`,
        // La hora del equipo tal cual, y cuando llego al servidor.
        registrada_en_dispositivo: () =>
          `CAST(:registradaEn AS timestamptz)::timestamp`,
        sincronizada_en: () => 'now()::timestamp',
      })
      .where('id = :ventaId', { ventaId })
      .setParameters({
        turnoId,
        registradaEn: new Date(registradaEn).toISOString(),
      })
      .execute();
  }

  private esDuplicada(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code ===
        VIOLACION_DE_UNICIDAD
    );
  }

  /**
   * El cliente sube la foto del comprobante de su pago por QR. Se puede reemplazar mientras
   * el pago siga por verificar (por ejemplo, si la tienda rechazo el anterior).
   */
  async subirComprobantePago(
    id: number,
    archivo: Express.Multer.File,
    actor: Usuario,
  ): Promise<Venta> {
    const venta = await this.obtener(id, actor);
    if (venta.usuario_id !== actor.id) {
      throw new ForbiddenException(
        'Solo quien hizo el pedido sube su comprobante',
      );
    }
    if (
      venta.metodo_pago !== MetodoPago.QR ||
      venta.estado_pago !== EstadoPago.PENDIENTE ||
      venta.cancelada_en
    ) {
      throw new ConflictException(
        'Este pedido no tiene un pago por QR esperando comprobante',
      );
    }

    const clave = await this.archivos.guardarPrivado(archivo, 'comprobantes');
    const anterior = venta.comprobante_pago;
    await this.repo.transaccion(async (manager) => {
      await manager
        .getRepository(Venta)
        .update({ id }, { comprobante_pago: clave });
      const envio = await manager
        .getRepository(Envio)
        .findOne({ where: { venta_id: id } });
      if (envio) {
        await manager.getRepository(EventoEnvio).save(
          manager.getRepository(EventoEnvio).create({
            envio_id: envio.id,
            estado: envio.estado,
            nota: anterior
              ? 'El cliente envio un nuevo comprobante de pago'
              : 'El cliente envio el comprobante de pago',
            usuario_id: actor.id,
          }),
        );
      }
    });
    await this.archivos.eliminarPrivado(anterior);

    return this.obtener(id, actor);
  }

  /** Archivo del comprobante: lo ve el cliente dueno del pedido y el personal. */
  async comprobantePago(
    id: number,
    actor: Usuario,
  ): Promise<{ ruta: string; tipo: string }> {
    const venta = await this.obtener(id, actor);
    const archivo = this.archivos.privado(venta.comprobante_pago);
    if (!archivo) {
      throw new NotFoundException('Este pedido no tiene comprobante de pago');
    }
    return archivo;
  }

  async actualizar(id: number, datos: ActualizarVentaDto): Promise<Venta> {
    const venta = await this.repo.obtener(id);
    if (!venta) throw new NotFoundException(NO_ENCONTRADA);

    Object.assign(venta, datos);
    return this.repo.guardar(venta);
  }

  async anular(id: number, actor: Usuario): Promise<{ mensaje: string }> {
    await this.repo.transaccion(async (manager) => {
      const venta = await manager.getRepository(Venta).findOne({
        where: { id },
        relations: { detalles: true },
      });
      if (!venta) throw new NotFoundException(NO_ENCONTRADA);

      if (venta.turno_id !== null) {
        const turno = await this.repo.turnoBloqueado(manager, venta.turno_id);
        if (turno?.cerrado_en) {
          throw new ConflictException(
            `La venta pertenece al turno #${turno.id}, que ya fue cerrado y arqueado: no se puede anular`,
          );
        }
      }

      // Un pedido cancelado ya devolvio su stock.
      if (!venta.cancelada_en) {
        await this.reingresarStock(
          manager,
          venta.detalles ?? [],
          actor,
          `Anulacion venta #${venta.id}`,
        );
      }

      await manager.getRepository(Venta).delete({ id });
    });

    return { mensaje: 'Venta anulada, el stock fue devuelto' };
  }

  /** Devuelve al stock de la sucursal las unidades de una venta. */
  async reingresarStock(
    manager: EntityManager,
    detalles: DetalleVenta[],
    actor: Usuario,
    motivo: string,
  ): Promise<void> {
    const ids = [
      ...new Set(detalles.map((detalle) => detalle.producto_sucursal_id)),
    ];
    if (ids.length === 0) return;

    const stocks = new Map(
      (await this.repo.bloquearStock(manager, ids)).map((stock) => [
        stock.id,
        stock,
      ]),
    );

    for (const detalle of detalles) {
      const stock = stocks.get(detalle.producto_sucursal_id);
      if (!stock) continue;

      stock.cantidad += detalle.cantidad;
      await manager.getRepository(ProductoSucursal).save(stock);

      await this.bitacora.registrar(
        manager,
        actor,
        `${motivo}: reingreso de ${detalle.cantidad} unidad(es)`,
        stock.producto?.nombre ?? null,
      );
    }
  }

  /** Total a cobrar: productos mas el envio a domicilio, si corresponde. */
  async totalDe(
    detalles: DetalleDeVentaDto[],
    entrega: EntregaDto | null = null,
  ): Promise<string> {
    const pedido = this.agruparPorStock(detalles);
    const stocks = await this.repo.stockPorIds([...pedido.keys()]);
    const porId = new Map(stocks.map((stock) => [stock.id, stock]));

    for (const [stockId, cantidad] of pedido) {
      const stock = porId.get(stockId);
      if (!stock)
        throw new BadRequestException(`No existe el stock ${stockId}`);

      const disponible = stock.cantidad - stock.cantidad_reservada;
      if (disponible < cantidad) {
        throw new ConflictException(
          `Stock insuficiente para el producto ${stock.producto_id}: ` +
            `quedan ${disponible}, se piden ${cantidad}`,
        );
      }
    }

    const precios = this.preciosDelPedido(pedido, porId);
    let totalCentavos = entrega ? await this.costoDeEnvio(entrega) : 0;
    for (const [stockId, cantidad] of pedido) {
      totalCentavos += subtotalEnCentavos(
        precios.get(stockId)!.precio,
        cantidad,
      );
    }

    return deCentavos(totalCentavos);
  }

  /** Precio unitario de cada linea, con el precio por mayor si el pedido alcanza el minimo. */
  private preciosDelPedido(
    pedido: Map<number, number>,
    stocks: Map<number, ProductoSucursal>,
  ): Map<number, PrecioAplicado> {
    return aplicarPrecios(
      [...pedido].map(([stockId, cantidad]) => {
        const stock = stocks.get(stockId)!;
        return {
          clave: stockId,
          cantidad,
          precio: stock.precio,
          precio_mayor: stock.producto?.precio_mayor ?? null,
          minimo_mayor:
            stock.producto?.minimo_mayor ?? MINIMO_MAYOR_POR_DEFECTO,
        };
      }),
    );
  }

  /** Costo del envio en centavos: el retiro es gratis y el domicilio usa la tarifa de la ciudad. */
  private async costoDeEnvio(entrega: EntregaDto): Promise<number> {
    if (entrega.modalidad === ModalidadEntrega.RETIRO) return 0;

    const ciudad = await this.repo.ciudad(entrega.ciudad_id!);
    if (!ciudad) throw new BadRequestException('La ciudad no existe');
    if (ciudad.costo_envio === null) {
      throw new BadRequestException(
        `Todavia no hacemos envios a ${ciudad.nombre}: elegi retiro en sucursal`,
      );
    }
    return aCentavos(ciudad.costo_envio);
  }

  private async crearEnvio(
    manager: EntityManager,
    ventaId: number,
    entrega: EntregaDto,
    sucursalId: number,
    costoCentavos: number,
    actor: Usuario,
  ): Promise<void> {
    const domicilio = entrega.modalidad === ModalidadEntrega.DOMICILIO;
    const repo = manager.getRepository(Envio);

    await repo.save(
      repo.create({
        venta_id: ventaId,
        modalidad: entrega.modalidad,
        estado: EstadoEnvio.PENDIENTE,
        sucursal_id: sucursalId,
        ciudad_id: domicilio ? entrega.ciudad_id : null,
        direccion: domicilio ? entrega.direccion!.trim() : null,
        referencia: domicilio ? entrega.referencia?.trim() || null : null,
        destinatario: domicilio ? entrega.destinatario!.trim() : null,
        telefono: domicilio ? entrega.telefono!.trim() : null,
        costo: deCentavos(costoCentavos),
        eventos: [
          manager.getRepository(EventoEnvio).create({
            estado: EstadoEnvio.PENDIENTE,
            nota: 'Pedido recibido',
            usuario_id: actor.id,
          }),
        ],
      }),
    );
  }

  private verificarReglasDePago(
    datos: CrearVentaDto,
    esCliente: boolean,
  ): void {
    const presencial = datos.tipo_venta === TipoVenta.PRESENCIAL;

    if (esCliente && presencial) {
      throw new ForbiddenException(
        'Un cliente no puede registrar ventas presenciales: las cobra la caja de la sucursal',
      );
    }

    if (presencial) {
      if (!datos.metodo_pago || !METODOS_DE_CAJA.includes(datos.metodo_pago)) {
        throw new BadRequestException(
          'Indica el metodo de pago de la venta presencial (efectivo, tarjeta o qr)',
        );
      }
      if (datos.entrega) {
        throw new BadRequestException(
          'La venta presencial se entrega en el mostrador: no lleva datos de envio',
        );
      }
    }

    if (datos.metodo_pago === MetodoPago.CONTRAENTREGA) {
      if (datos.pago_id) {
        throw new BadRequestException(
          'Un pedido contraentrega no lleva pago por la pasarela',
        );
      }
      if (datos.tipo_venta !== TipoVenta.VIRTUAL) {
        throw new BadRequestException(
          'El pago contraentrega es para pedidos en linea',
        );
      }
      // Domicilio: se paga al repartidor. Retiro: se paga al retirar en la sucursal.
      return;
    }

    if (datos.pago_id) {
      this.pagos.exigirPasarela();
      return;
    }

    // QR: la tienda verifica el deposito antes de preparar el pedido.
    if (datos.metodo_pago === MetodoPago.QR) return;

    if (esCliente && this.pagos.habilitado) {
      throw new HttpException(
        'Falta el pago: la compra virtual debe pagarse con tarjeta, QR o contraentrega',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private async verificarLimiteDeContraentrega(
    usuarioId: number,
  ): Promise<void> {
    const pendientes = await this.repo.contraentregasPendientes(usuarioId);
    if (pendientes >= this.contraentregaPendientesMax) {
      throw new ConflictException(
        `Ya tenes ${pendientes} pedido(s) contraentrega sin entregar: ` +
          'espera a recibirlos o paga con tarjeta',
      );
    }
  }

  private async verificarLimiteDeQr(usuarioId: number): Promise<void> {
    const pendientes = await this.repo.qrSinVerificar(usuarioId);
    if (pendientes >= this.qrPendientesMax) {
      throw new ConflictException(
        `Ya tenes ${pendientes} pedido(s) pagados por QR esperando verificacion: ` +
          'espera a que la tienda los confirme o paga con tarjeta',
      );
    }
  }

  /** La venta presencial se cobra siempre dentro del turno abierto de quien la registra. */
  private async turnoParaCobrar(
    manager: EntityManager,
    actor: Usuario,
  ): Promise<TurnoCaja> {
    const turno = await this.repo.turnoAbiertoBloqueado(manager, actor.id);
    if (!turno) {
      throw new ConflictException(
        'No tenes un turno de caja abierto: abri uno antes de cobrar',
      );
    }
    return turno;
  }

  private verificarSucursalDelTurno(
    sucursalId: number,
    stocks: Map<number, ProductoSucursal>,
  ): void {
    for (const stock of stocks.values()) {
      if (stock.sucursal_id !== sucursalId) {
        throw new ConflictException(
          'Hay productos de otra sucursal: el turno solo cobra stock de su propia sucursal',
        );
      }
    }
  }

  /** Un pedido online sale de una sola sucursal. */
  private sucursalUnica(stocks: Map<number, ProductoSucursal>): number {
    const sucursales = new Set(
      [...stocks.values()].map((stock) => stock.sucursal_id),
    );
    if (sucursales.size !== 1) {
      throw errorDeNegocio(
        ConflictException,
        CodigoError.SUCURSALES_MEZCLADAS,
        'Todos los productos del pedido deben ser de la misma sucursal',
      );
    }
    return [...sucursales][0];
  }

  /**
   * Precios de una venta registrada sin conexion. Si el equipo mando el precio de cada
   * linea, el total tiene que cuadrar con ellas, y si alguna no coincide con el precio
   * vigente la venta queda en conflicto (PRECIO_CAMBIADO), salvo que un administrador o
   * encargado pida respetar lo cobrado. En ese caso se usan los precios del equipo y
   * precio_lista conserva el del servidor. Devuelve quien autorizo, si hizo falta.
   */
  private async aplicarPreciosCobrados(
    manager: EntityManager,
    datos: CrearVentaDto,
    actor: Usuario,
    precios: Map<number, PrecioAplicado>,
    stocks: Map<number, ProductoSucursal>,
  ): Promise<number | null> {
    const conPrecio = datos.detalles.filter((d) => d.precio !== undefined);
    if (conPrecio.length === 0) return null;
    if (conPrecio.length !== datos.detalles.length) {
      throw new BadRequestException(
        'Si se envian los precios cobrados, tienen que venir en todas las lineas',
      );
    }

    const cobrados = new Map<number, string>();
    for (const linea of datos.detalles) {
      const precio = deCentavos(aCentavos(linea.precio!));
      const previo = cobrados.get(linea.producto_sucursal_id);
      if (previo !== undefined && previo !== precio) {
        throw new BadRequestException(
          'Una misma prenda no puede venir con dos precios distintos',
        );
      }
      cobrados.set(linea.producto_sucursal_id, precio);
    }

    if (datos.total !== undefined) {
      const suma = datos.detalles.reduce(
        (acc, d) =>
          acc +
          subtotalEnCentavos(cobrados.get(d.producto_sucursal_id)!, d.cantidad),
        0,
      );
      if (suma !== aCentavos(datos.total)) {
        throw errorDeNegocio(
          BadRequestException,
          CodigoError.TOTAL_INCONSISTENTE,
          `El total cobrado (Bs ${datos.total}) no coincide con la suma de las prendas (Bs ${deCentavos(suma)})`,
        );
      }
    }

    const diferencias = [...cobrados]
      .filter(([stockId, precio]) => precios.get(stockId)!.precio !== precio)
      .map(([stockId, precio]) => ({
        producto_sucursal_id: stockId,
        producto: stocks.get(stockId)?.producto?.nombre ?? null,
        cobrado: precio,
        actual: precios.get(stockId)!.precio,
      }));
    if (diferencias.length === 0) return null;

    if (!datos.respetar_precios) {
      const lista = diferencias
        .map(
          (d) =>
            `${d.producto ?? 'Prenda'}: se cobro Bs ${d.cobrado}, hoy vale Bs ${d.actual}`,
        )
        .join('; ');
      throw new ConflictException({
        detail: `El precio cambio mientras no habia conexion. ${lista}`,
        codigo: CodigoError.PRECIO_CAMBIADO,
        precios: diferencias,
      });
    }
    const autorizador = await this.supervisorQueAutoriza(manager, datos, actor);
    for (const d of diferencias) {
      const aplicado = precios.get(d.producto_sucursal_id)!;
      precios.set(d.producto_sucursal_id, {
        ...aplicado,
        precio: d.cobrado,
        por_mayor: aCentavos(d.cobrado) < aCentavos(aplicado.precio_lista),
      });
    }
    return autorizador;
  }

  /**
   * Quien autoriza respetar un precio distinto: el mismo vendedor si es administrador
   * o encargado o, si no, un supervisor que escribe su usuario y contrasena en el
   * equipo del cajero (no se guarda: viaja solo en ese envio). RLS limita la busqueda
   * a la empresa de la sesion.
   */
  private async supervisorQueAutoriza(
    manager: EntityManager,
    datos: CrearVentaDto,
    actor: Usuario,
  ): Promise<number> {
    const supervisores: readonly string[] = [Rol.ADMINISTRADOR, Rol.ENCARGADO];
    if (supervisores.includes(actor.rol?.nombre ?? '')) return actor.id;

    const credenciales = datos.autorizacion;
    if (credenciales) {
      const filas: { id: number; password: string; rol: string }[] =
        await manager.query(
          `SELECT u.id, u.password, r.nombre AS rol
           FROM usuarios u JOIN roles r ON r.id = u.rol_id
          WHERE u.username = $1`,
          [credenciales.username],
        );
      const supervisor = filas[0];
      if (
        supervisor &&
        supervisores.includes(supervisor.rol) &&
        (await verificarPassword(credenciales.password, supervisor.password))
      ) {
        return supervisor.id;
      }
    }
    throw new ForbiddenException(
      'Para respetar un precio distinto al de lista hace falta la autorizacion de un administrador o encargado',
    );
  }

  private agruparPorStock(detalles: DetalleDeVentaDto[]): Map<number, number> {
    const pedido = new Map<number, number>();
    for (const linea of detalles) {
      pedido.set(
        linea.producto_sucursal_id,
        (pedido.get(linea.producto_sucursal_id) ?? 0) + linea.cantidad,
      );
    }
    return pedido;
  }

  private async bloquearYValidar(
    manager: EntityManager,
    pedido: Map<number, number>,
  ): Promise<Map<number, ProductoSucursal>> {
    const ids = [...pedido.keys()];
    const filas = await this.repo.bloquearStock(manager, ids);
    const stocks = new Map(filas.map((stock) => [stock.id, stock]));

    for (const [stockId, cantidad] of pedido) {
      const stock = stocks.get(stockId);
      if (!stock)
        throw new BadRequestException(`No existe el stock ${stockId}`);

      const disponible = stock.cantidad - stock.cantidad_reservada;
      if (disponible < cantidad) {
        throw new ConflictException(
          `Stock insuficiente para el producto ${stock.producto_id}: ` +
            `quedan ${disponible}, se piden ${cantidad}`,
        );
      }
    }

    const conProducto = await manager.getRepository(ProductoSucursal).find({
      where: ids.map((id) => ({ id })),
      relations: { producto: true },
    });
    for (const fila of conProducto) {
      const stock = stocks.get(fila.id);
      if (stock) stock.producto = fila.producto;
    }

    return stocks;
  }

  private esCliente(usuario: Usuario): boolean {
    return usuario.rol?.nombre === Rol.CLIENTE;
  }
}
