import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type EntityManager, QueryFailedError } from 'typeorm';
import { aCentavos, deCentavos } from '../commons/dinero.js';
import {
  METODOS_DE_CAJA,
  MetodoPago,
  TipoMovimientoCaja,
} from '../commons/enums/caja.enum.js';
import { Rol } from '../commons/enums/rol.enum.js';
import type {
  AbrirTurnoDto,
  CerrarTurnoDto,
  FiltroTurnosDto,
  MovimientoCajaDto,
} from '../dto/caja.dto.js';
import { MovimientoCaja } from '../entities/movimiento-caja.entity.js';
import { TurnoCaja } from '../entities/turno-caja.entity.js';
import type { Usuario } from '../entities/usuario.entity.js';
import {
  CajaRepository,
  type TotalesDeTurno,
} from '../repositories/caja.repository.js';
import { BitacoraService } from './bitacora.service.js';

const NO_ENCONTRADO = 'Turno no encontrado';
const VIOLACION_DE_UNICIDAD = '23505';

export interface ResumenDeTurno {
  ventas: number;
  total_ventas: string;
  por_metodo: Partial<Record<MetodoPago, { cantidad: number; total: string }>>;
  ingresos: string;
  egresos: string;
  /** Monto inicial + ventas en efectivo + ingresos - egresos. */
  efectivo_esperado: string;
}

/** Arqueo del turno: lo que deberia haber en caja segun lo registrado. */
function resumir(
  montoInicial: string,
  totales: TotalesDeTurno,
): ResumenDeTurno {
  const porMetodo = Object.fromEntries(
    METODOS_DE_CAJA.map((metodo) => [metodo, { cantidad: 0, total: 0 }]),
  ) as Partial<Record<MetodoPago, { cantidad: number; total: number }>>;

  let ventas = 0;
  let totalVentas = 0;
  for (const fila of totales.ventas) {
    const centavos = aCentavos(fila.total);
    ventas += fila.cantidad;
    totalVentas += centavos;
    const acumulado = fila.metodo_pago
      ? porMetodo[fila.metodo_pago]
      : undefined;
    if (acumulado) {
      acumulado.cantidad += fila.cantidad;
      acumulado.total += centavos;
    }
  }

  const sumaDe = (tipo: TipoMovimientoCaja) =>
    aCentavos(totales.movimientos.find((m) => m.tipo === tipo)?.total ?? '0');
  const ingresos = sumaDe(TipoMovimientoCaja.INGRESO);
  const egresos = sumaDe(TipoMovimientoCaja.EGRESO);

  return {
    ventas,
    total_ventas: deCentavos(totalVentas),
    por_metodo: Object.fromEntries(
      Object.entries(porMetodo).map(([metodo, fila]) => [
        metodo,
        { cantidad: fila.cantidad, total: deCentavos(fila.total) },
      ]),
    ) as ResumenDeTurno['por_metodo'],
    ingresos: deCentavos(ingresos),
    egresos: deCentavos(egresos),
    efectivo_esperado: deCentavos(
      aCentavos(montoInicial) +
        (porMetodo[MetodoPago.EFECTIVO]?.total ?? 0) +
        ingresos -
        egresos,
    ),
  };
}

@Injectable()
export class CajaService {
  constructor(
    private readonly repo: CajaRepository,
    private readonly bitacora: BitacoraService,
  ) {}

  /** Turno abierto del usuario con su arqueo al momento, o nulos si no tiene uno. */
  async actual(actor: Usuario) {
    const turno = await this.repo.abiertoDe(actor.id);
    if (!turno) return { turno: null, resumen: null };
    return { turno, resumen: await this.resumenDe(turno) };
  }

  async listar(filtro: FiltroTurnosDto, actor: Usuario): Promise<TurnoCaja[]> {
    const alcance = { ...filtro };

    if (this.tieneRol(actor, Rol.CAJERO)) {
      alcance.cajero_id = actor.id;
    } else if (this.tieneRol(actor, Rol.ENCARGADO)) {
      alcance.sucursal_id = await this.sucursalPropia(
        actor,
        filtro.sucursal_id,
      );
    }

    return this.repo.listar(alcance);
  }

  /** Turno con su arqueo, los movimientos manuales y las ventas cobradas. */
  async obtener(id: number, actor: Usuario) {
    const turno = await this.repo.obtener(id);
    if (!turno) throw new NotFoundException(NO_ENCONTRADO);
    await this.verificarAcceso(turno, actor);

    const [resumen, movimientos, ventas] = await Promise.all([
      this.resumenDe(turno),
      this.repo.movimientosDe(id),
      this.repo.ventasDe(id),
    ]);
    return { turno, resumen, movimientos, ventas };
  }

  async abrir(datos: AbrirTurnoDto, actor: Usuario) {
    if (!(await this.repo.existeSucursal(datos.sucursal_id))) {
      throw new BadRequestException('La sucursal no existe');
    }
    if (this.tieneRol(actor, Rol.CAJERO)) {
      await this.sucursalPropia(actor, datos.sucursal_id);
    }

    try {
      await this.repo.transaccion(async (manager) => {
        const turno = await manager.getRepository(TurnoCaja).save(
          manager.getRepository(TurnoCaja).create({
            sucursal_id: datos.sucursal_id,
            cajero_id: actor.id,
            monto_inicial: datos.monto_inicial,
          }),
        );
        await this.bitacora.registrar(
          manager,
          actor,
          `Apertura del turno de caja #${turno.id} con Bs ${turno.monto_inicial}`,
        );
      });
    } catch (error) {
      if (this.esDuplicado(error)) {
        throw new ConflictException(
          'Ya tenes un turno abierto: cerralo antes de abrir otro',
        );
      }
      throw error;
    }

    return this.actual(actor);
  }

  async registrarMovimiento(
    turnoId: number,
    datos: MovimientoCajaDto,
    actor: Usuario,
  ): Promise<MovimientoCaja> {
    return this.repo.transaccion(async (manager) => {
      const turno = await this.bloquearAbierto(manager, turnoId, actor);

      if (datos.tipo === TipoMovimientoCaja.EGRESO) {
        const resumen = resumir(
          turno.monto_inicial,
          await this.repo.totales(turno.id, manager),
        );
        if (aCentavos(datos.monto) > aCentavos(resumen.efectivo_esperado)) {
          throw new ConflictException(
            `No hay suficiente efectivo en caja: quedan Bs ${resumen.efectivo_esperado}`,
          );
        }
      }

      const movimiento = await manager.getRepository(MovimientoCaja).save(
        manager.getRepository(MovimientoCaja).create({
          turno_id: turno.id,
          tipo: datos.tipo,
          monto: datos.monto,
          motivo: datos.motivo.trim(),
          usuario_id: actor.id,
        }),
      );
      await this.bitacora.registrar(
        manager,
        actor,
        `Turno #${turno.id}: ${datos.tipo} de caja por Bs ${movimiento.monto} (${movimiento.motivo})`,
      );
      return movimiento;
    });
  }

  async cerrar(turnoId: number, datos: CerrarTurnoDto, actor: Usuario) {
    await this.repo.transaccion(async (manager) => {
      const turno = await this.bloquearAbierto(manager, turnoId, actor);
      const resumen = resumir(
        turno.monto_inicial,
        await this.repo.totales(turno.id, manager),
      );

      turno.efectivo_esperado = resumen.efectivo_esperado;
      turno.efectivo_contado = datos.efectivo_contado;
      turno.diferencia = deCentavos(
        aCentavos(datos.efectivo_contado) -
          aCentavos(resumen.efectivo_esperado),
      );
      turno.observacion = datos.observacion?.trim() || null;
      // now() de Postgres: la misma zona horaria que abierto_en (DEFAULT now()).
      await manager.getRepository(TurnoCaja).update(
        { id: turno.id },
        {
          cerrado_en: () => 'now()',
          efectivo_esperado: turno.efectivo_esperado,
          efectivo_contado: turno.efectivo_contado,
          diferencia: turno.diferencia,
          observacion: turno.observacion,
        },
      );

      await this.bitacora.registrar(
        manager,
        actor,
        `Cierre del turno de caja #${turno.id}: esperado Bs ${turno.efectivo_esperado}, ` +
          `contado Bs ${turno.efectivo_contado}, diferencia Bs ${turno.diferencia}`,
      );
    });

    return this.obtener(turnoId, actor);
  }

  private async resumenDe(turno: TurnoCaja): Promise<ResumenDeTurno> {
    return resumir(turno.monto_inicial, await this.repo.totales(turno.id));
  }

  /** Solo el cajero dueno del turno (o un administrador) puede operar sobre el mientras esta abierto. */
  private async bloquearAbierto(
    manager: EntityManager,
    turnoId: number,
    actor: Usuario,
  ): Promise<TurnoCaja> {
    const turno = await this.repo.bloquear(manager, turnoId);
    if (!turno) throw new NotFoundException(NO_ENCONTRADO);

    if (
      turno.cajero_id !== actor.id &&
      !this.tieneRol(actor, Rol.ADMINISTRADOR)
    ) {
      throw new ForbiddenException('Ese turno no es tuyo');
    }
    if (turno.cerrado_en) {
      throw new ConflictException('El turno ya esta cerrado');
    }
    return turno;
  }

  private async verificarAcceso(
    turno: TurnoCaja,
    actor: Usuario,
  ): Promise<void> {
    if (this.tieneRol(actor, Rol.CAJERO) && turno.cajero_id !== actor.id) {
      throw new ForbiddenException('Ese turno no es tuyo');
    }
    if (this.tieneRol(actor, Rol.ENCARGADO)) {
      await this.sucursalPropia(actor, turno.sucursal_id);
    }
  }

  /** Sucursal de la ficha de trabajador; si se pide otra distinta, se rechaza. */
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
      throw new ForbiddenException('Solo podes operar en tu sucursal');
    }
    return propia;
  }

  private tieneRol(usuario: Usuario, rol: Rol): boolean {
    return usuario.rol?.nombre === rol;
  }

  private esDuplicado(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code ===
        VIOLACION_DE_UNICIDAD
    );
  }
}
