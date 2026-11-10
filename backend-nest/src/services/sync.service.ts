import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CAPACIDAD, Rol } from '../commons/enums/rol.enum.js';
import { ConfigService } from '@nestjs/config';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CodigoError } from '../commons/errores.js';
import { CrearReservaDto } from '../dto/reserva.dto.js';
import type { OperacionSyncDto, SyncPushDto } from '../dto/sync.dto.js';
import { CrearVentaDto } from '../dto/venta.dto.js';
import { ReservasService } from './reservas.service.js';
import { VentasService } from './ventas.service.js';
import type { Configuracion } from '../config/configuracion.js';
import type { Reserva } from '../entities/reserva.entity.js';
import type { Usuario } from '../entities/usuario.entity.js';
import {
  type RecursoCatalogo,
  SyncRepository,
  TABLAS_CATALOGO,
} from '../repositories/sync.repository.js';

const RECURSOS = Object.keys(TABLAS_CATALOGO) as RecursoCatalogo[];

const RECURSO_POR_TABLA = Object.fromEntries(
  RECURSOS.map((recurso) => [TABLAS_CATALOGO[recurso].tabla, recurso]),
) as Record<string, RecursoCatalogo>;

@Injectable()
export class SyncService {
  private readonly horasVigencia: number;

  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly repo: SyncRepository,
    private readonly ventas: VentasService,
    private readonly reservas: ReservasService,
    config: ConfigService<Configuracion, true>,
  ) {
    this.horasVigencia = config.get('reservas', { infer: true }).horasVigencia;
  }

  async catalogo(desde?: string) {
    const hasta = await this.repo.corte();
    const inicio = desde ?? null;

    const datos: Record<string, unknown[]> = {};
    for (const recurso of RECURSOS) {
      datos[recurso] = await this.repo.cambiosDe(recurso, inicio);
    }

    const eliminados = Object.fromEntries(
      RECURSOS.map((recurso) => [recurso, [] as number[]]),
    );
    if (inicio) {
      const filas = await this.repo.eliminados(
        RECURSOS.map((recurso) => TABLAS_CATALOGO[recurso].tabla),
        inicio,
      );
      for (const fila of filas) {
        eliminados[RECURSO_POR_TABLA[fila.tabla]].push(fila.registro_id);
      }
    }

    return {
      completo: inicio === null,
      hasta: hasta.toISOString(),
      ...datos,
      eliminados,
    };
  }

  /**
   * Subconjunto del catalogo que el vendedor guarda en el telefono (SQLite):
   * solo la sucursal en la que trabaja, con el stock conocido en este momento,
   * los clientes para asociar a ventas y reservas, y su turno de caja abierto.
   */
  async tienda(usuario: Usuario, sucursalPedida?: number) {
    const rol = usuario.rol?.nombre;
    const esAdmin = rol === Rol.ADMINISTRADOR;

    const todas = await this.repo.sucursales();
    let autorizadas = todas;
    if (!esAdmin) {
      const propia = await this.repo.sucursalDeTrabajador(usuario.id);
      autorizadas = todas.filter((s) => s.id === propia);
      if (autorizadas.length === 0) {
        throw new ForbiddenException(
          'No tenes una sucursal asignada: pedile al administrador que te asigne una',
        );
      }
    }

    const sucursal =
      autorizadas.find((s) => s.id === sucursalPedida) ?? autorizadas[0];
    if (!sucursal) {
      throw new ForbiddenException('La empresa todavia no tiene sucursales');
    }

    const [prendas, clientes, turno] = await Promise.all([
      this.repo.prendasDeSucursal(sucursal.id),
      this.repo.clientes(),
      this.repo.turnoAbierto(usuario.id),
    ]);

    return {
      generado_en: new Date().toISOString(),
      sucursal_id: sucursal.id,
      sucursales: autorizadas,
      prendas,
      clientes,
      turno,
      permisos: {
        ventas: rol === Rol.ADMINISTRADOR || rol === Rol.CAJERO,
        reservas: rol === Rol.ADMINISTRADOR || rol === Rol.ENCARGADO,
      },
    };
  }

  // ===================================================== envio por lote

  /**
   * Registra en orden las operaciones hechas sin conexion. Cada una se procesa
   * por separado (su propia transaccion): que una falle no frena a las demas.
   * Resultados por operacion:
   *  - confirmada: se registro ahora (servidor_id = id de la venta o reserva).
   *  - duplicada: ya estaba registrada con ese UUID (reenvio); no se duplica.
   *  - conflicto: el stock real no alcanza; trae el detalle por prenda.
   *  - rechazada: no cumple una regla del negocio o los datos son invalidos.
   *  - error: fallo del servidor; el dispositivo debe reintentar mas tarde.
   * Cada resultado queda en sync_log, sin el contenido de la operacion.
   */
  async push(lote: SyncPushDto, usuario: Usuario) {
    const idLote = randomUUID();
    const empresa = await this.repo.slugDeEmpresa();
    const resultados: ResultadoDeOperacion[] = [];
    const registro: Parameters<SyncRepository['registrarLog']>[0] = [];

    for (const operacion of lote.operaciones) {
      const inicio = Date.now();
      const resultado = await this.procesar(operacion, usuario, empresa);
      resultados.push(resultado);
      registro.push({
        lote: idLote,
        operacion_id: operacion.id,
        tipo: operacion.tipo,
        usuario_id: usuario.id,
        sucursal_id: operacion.sucursal_id ?? null,
        dispositivo: lote.dispositivo ?? null,
        intento: operacion.intento ?? 1,
        resultado: resultado.resultado,
        codigo_http: resultado.codigo_http ?? null,
        codigo_error: resultado.codigo ?? null,
        mensaje: resultado.mensaje?.slice(0, 255) ?? null,
        servidor_id: resultado.servidor_id ?? null,
        duracion_ms: Date.now() - inicio,
      });
    }

    try {
      await this.repo.registrarLog(registro);
    } catch (error) {
      // El registro es para diagnostico: si falla, las operaciones igual quedaron hechas.
      this.logger.error(
        'No se pudo guardar el registro de sincronizacion',
        error,
      );
    }

    const contar = (r: string) =>
      resultados.filter((x) => x.resultado === r).length;
    return {
      lote: idLote,
      recibidas: lote.operaciones.length,
      resumen: {
        confirmadas: contar('confirmada'),
        duplicadas: contar('duplicada'),
        rechazadas: contar('rechazada'),
        conflictos: contar('conflicto'),
        errores: contar('error'),
      },
      resultados,
    };
  }

  private async procesar(
    operacion: OperacionSyncDto,
    usuario: Usuario,
    empresa: string | null,
  ): Promise<ResultadoDeOperacion> {
    const base = { id: operacion.id, tipo: operacion.tipo };

    if (operacion.empresa && empresa && operacion.empresa !== empresa) {
      return {
        ...base,
        resultado: 'rechazada',
        codigo_http: 403,
        mensaje: `La operacion es de la tienda "${operacion.empresa}" y tu usuario es de otra empresa`,
      };
    }

    // Los mismos roles que POST /ventas y POST /reservas.
    const permitidos: readonly string[] =
      operacion.tipo === 'venta'
        ? CAPACIDAD.venta
        : [...CAPACIDAD.reservas, Rol.CLIENTE];
    if (!permitidos.includes(usuario.rol?.nombre ?? '')) {
      return {
        ...base,
        resultado: 'rechazada',
        codigo_http: 403,
        mensaje: `Tu rol no puede registrar operaciones de tipo ${operacion.tipo}`,
      };
    }

    // Reenvio de algo ya registrado: no se vuelve a procesar.
    const previa = await this.repo.yaRegistrada(operacion.tipo, operacion.id);
    if (previa !== null) {
      return {
        ...base,
        resultado: 'duplicada',
        servidor_id: previa,
        mensaje: 'Ya estaba registrada',
      };
    }

    const plano = { ...operacion.datos, id_cliente: operacion.id };
    const opciones = { enableImplicitConversion: true };
    const dto: CrearVentaDto | CrearReservaDto =
      operacion.tipo === 'venta'
        ? plainToInstance(CrearVentaDto, plano, opciones)
        : plainToInstance(CrearReservaDto, plano, opciones);
    const errores = await validate(dto, { whitelist: true });
    if (errores.length > 0) {
      const primero = errores[0];
      const detalle =
        Object.values(primero.constraints ?? {})[0] ??
        `${primero.property} es invalido`;
      return {
        ...base,
        resultado: 'rechazada',
        codigo_http: 400,
        mensaje: `Datos invalidos: ${detalle}`,
      };
    }

    // Todas las prendas tienen que ser de una misma sucursal: la declarada o,
    // si el dispositivo no la mando, la de la primera prenda.
    const ids = dto.detalles.map((d) => d.producto_sucursal_id);
    const stocks = await this.repo.stockReal(ids);
    if (stocks.length !== new Set(ids).size) {
      return {
        ...base,
        resultado: 'rechazada',
        codigo_http: 400,
        mensaje: 'Una de las prendas ya no existe en el servidor',
      };
    }
    const sucursal = operacion.sucursal_id ?? stocks[0]?.sucursal_id;
    operacion.sucursal_id = sucursal;
    const ajena = stocks.find((s) => s.sucursal_id !== sucursal);
    if (ajena) {
      return {
        ...base,
        resultado: 'rechazada',
        codigo_http: 400,
        mensaje: `${ajena.producto} no es de la sucursal ${sucursal}`,
      };
    }

    try {
      const creada =
        operacion.tipo === 'venta'
          ? await this.ventas.crear(dto as CrearVentaDto, usuario)
          : await this.reservas.crear(dto as CrearReservaDto, usuario);
      return {
        ...base,
        resultado: 'confirmada',
        codigo_http: 201,
        servidor_id: creada.id,
      };
    } catch (error) {
      return this.clasificarError(base, error, dto.detalles);
    }
  }

  private async clasificarError(
    base: { id: string; tipo: string },
    error: unknown,
    detalles: { producto_sucursal_id: number; cantidad: number }[],
  ): Promise<ResultadoDeOperacion> {
    if (!(error instanceof HttpException)) {
      this.logger.error(`Fallo al sincronizar ${base.tipo} ${base.id}`, error);
      return {
        ...base,
        resultado: 'error',
        codigo_http: 500,
        mensaje: 'Error interno: reintentar mas tarde',
      };
    }

    const status = error.getStatus();
    const cuerpo = error.getResponse() as
      { detail?: unknown; message?: unknown; codigo?: string } | string;
    const mensaje =
      typeof cuerpo === 'string'
        ? cuerpo
        : String(
            cuerpo.detail ??
              (Array.isArray(cuerpo.message)
                ? cuerpo.message[0]
                : cuerpo.message) ??
              error.message,
          );
    const codigo = typeof cuerpo === 'object' ? cuerpo.codigo : undefined;

    if (status >= 500)
      return { ...base, resultado: 'error', codigo_http: status, mensaje };

    if (codigo === CodigoError.PRECIO_CAMBIADO) {
      // Conflicto de precio: lo cobrado sin conexion no coincide con el precio vigente.
      const precios =
        typeof cuerpo === 'object'
          ? (cuerpo as { precios?: ConflictoDePrecio[] }).precios
          : undefined;
      return {
        ...base,
        resultado: 'conflicto',
        codigo_http: status,
        codigo,
        mensaje,
        precios: precios ?? [],
      };
    }

    const esStock =
      codigo === CodigoError.SIN_STOCK ||
      codigo === CodigoError.STOCK_INEXISTENTE ||
      (status === 409 && mensaje.toLowerCase().includes('stock'));
    if (esStock) {
      // Conflicto: el inventario del dispositivo no coincidia con el real.
      const reales = new Map(
        (
          await this.repo.stockReal(detalles.map((d) => d.producto_sucursal_id))
        ).map((s) => [s.id, s]),
      );
      return {
        ...base,
        resultado: 'conflicto',
        codigo_http: status,
        codigo: codigo ?? CodigoError.SIN_STOCK,
        mensaje,
        conflicto: detalles.map((d) => ({
          producto_sucursal_id: d.producto_sucursal_id,
          producto: reales.get(d.producto_sucursal_id)?.producto ?? null,
          pedido: d.cantidad,
          disponible: reales.get(d.producto_sucursal_id)?.disponible ?? 0,
        })),
      };
    }

    return {
      ...base,
      resultado: 'rechazada',
      codigo_http: status,
      codigo,
      mensaje,
    };
  }

  async registro(resultado?: string) {
    const [operaciones, ultimos7dias] = await Promise.all([
      this.repo.registro(resultado),
      this.repo.resumenRegistro(),
    ]);
    return { ultimos_7_dias: ultimos7dias, operaciones };
  }

  async misDatos(usuario: Usuario, desde?: string) {
    const hasta = await this.repo.corte();
    const inicio = desde ?? null;

    const [reservas, ventas] = await Promise.all([
      this.repo
        .idsCambiados('reserva', usuario.id, inicio)
        .then((ids) => this.repo.reservasCompletas(ids)),
      this.repo
        .idsCambiados('ventas', usuario.id, inicio)
        .then((ids) => this.repo.ventasCompletas(ids)),
    ]);

    const eliminados = { reservas: [] as number[], ventas: [] as number[] };
    if (inicio) {
      const filas = await this.repo.eliminados(
        ['reserva', 'ventas'],
        inicio,
        usuario.id,
      );
      for (const fila of filas) {
        const lista =
          fila.tabla === 'reserva' ? eliminados.reservas : eliminados.ventas;
        lista.push(fila.registro_id);
      }
    }

    return {
      completo: inicio === null,
      hasta: hasta.toISOString(),
      reservas: reservas.map((reserva) => ({
        ...instanceToPlain(reserva),
        vence_en: this.venceEn(reserva),
      })),
      ventas: ventas.map((venta) => instanceToPlain(venta)),
      eliminados,
    };
  }

  // Misma regla que ReservasRepository.vencidas: fecha + hora + horas de
  // vigencia, en hora local de la tienda (sin zona, como fecha y hora).
  private venceEn(reserva: Reserva): string | null {
    const [anio, mes, dia] = reserva.fecha.split('-').map(Number);
    const [hora, minuto, segundo] = reserva.hora.split(':').map(Number);
    if ([anio, mes, dia].some(Number.isNaN)) return null;

    const momento = new Date(
      Date.UTC(anio, mes - 1, dia, hora || 0, minuto || 0, segundo || 0) +
        this.horasVigencia * 60 * 60 * 1000,
    );
    return momento.toISOString().slice(0, 19);
  }
}

export interface ResultadoDeOperacion {
  id: string;
  tipo: string;
  resultado: 'confirmada' | 'duplicada' | 'rechazada' | 'conflicto' | 'error';
  servidor_id?: number;
  codigo_http?: number;
  codigo?: string;
  mensaje?: string;
  conflicto?: {
    producto_sucursal_id: number;
    producto: string | null;
    pedido: number;
    disponible: number;
  }[];
  /** Conflicto de precio: lo que se cobro sin conexion y lo que vale hoy. */
  precios?: ConflictoDePrecio[];
}

export interface ConflictoDePrecio {
  producto_sucursal_id: number;
  producto: string | null;
  cobrado: string;
  actual: string;
}
