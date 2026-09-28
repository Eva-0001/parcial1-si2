import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../commons/decorators/roles.decorator.js';
import { UsuarioActual } from '../commons/decorators/usuario-actual.decorator.js';
import { CAPACIDAD, Rol } from '../commons/enums/rol.enum.js';
import { PipeId } from '../commons/pipes.js';
import {
  AbrirTurnoDto,
  CerrarTurnoDto,
  FiltroTurnosDto,
  MovimientoCajaDto,
} from '../dto/caja.dto.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { CajaService } from '../services/caja.service.js';

@ApiTags('Caja y turnos')
@ApiBearerAuth()
@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Roles(...CAPACIDAD.caja)
  @Get('turno-actual')
  @ApiOperation({
    summary: 'Turno abierto del usuario con su arqueo al momento',
  })
  actual(@UsuarioActual() actor: Usuario) {
    return this.caja.actual(actor);
  }

  @Roles(...CAPACIDAD.caja, Rol.ENCARGADO)
  @Get('turnos')
  @ApiOperation({
    summary:
      'Historial de turnos. El cajero ve los suyos y el encargado los de su sucursal',
  })
  listar(@Query() filtro: FiltroTurnosDto, @UsuarioActual() actor: Usuario) {
    return this.caja.listar(filtro, actor);
  }

  @Roles(...CAPACIDAD.caja, Rol.ENCARGADO)
  @Get('turnos/:turno_id')
  @ApiOperation({
    summary: 'Detalle de un turno: arqueo, movimientos y ventas cobradas',
  })
  obtener(
    @Param('turno_id', PipeId) id: number,
    @UsuarioActual() actor: Usuario,
  ) {
    return this.caja.obtener(id, actor);
  }

  @Roles(...CAPACIDAD.caja)
  @Post('turnos')
  @ApiOperation({ summary: 'Abrir un turno de caja con su monto inicial' })
  abrir(@Body() datos: AbrirTurnoDto, @UsuarioActual() actor: Usuario) {
    return this.caja.abrir(datos, actor);
  }

  @Roles(...CAPACIDAD.caja)
  @Post('turnos/:turno_id/movimientos')
  @ApiOperation({
    summary: 'Registrar un ingreso o egreso de efectivo en un turno abierto',
  })
  registrarMovimiento(
    @Param('turno_id', PipeId) id: number,
    @Body() datos: MovimientoCajaDto,
    @UsuarioActual() actor: Usuario,
  ) {
    return this.caja.registrarMovimiento(id, datos, actor);
  }

  @Roles(...CAPACIDAD.caja)
  @Post('turnos/:turno_id/cierre')
  @ApiOperation({
    summary: 'Cerrar el turno con el arqueo: efectivo contado vs esperado',
  })
  cerrar(
    @Param('turno_id', PipeId) id: number,
    @Body() datos: CerrarTurnoDto,
    @UsuarioActual() actor: Usuario,
  ) {
    return this.caja.cerrar(id, datos, actor);
  }
}
