import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../commons/decorators/roles.decorator.js';
import { UsuarioActual } from '../commons/decorators/usuario-actual.decorator.js';
import { CAPACIDAD } from '../commons/enums/rol.enum.js';
import { PipeId } from '../commons/pipes.js';
import { CrearCambioDto, FiltroCambiosDto } from '../dto/cambio.dto.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { CambiosService } from '../services/cambios.service.js';

@ApiTags('Cambios de prendas')
@ApiBearerAuth()
@Roles(...CAPACIDAD.cambios)
@Controller('cambios')
export class CambiosController {
  constructor(private readonly cambios: CambiosService) {}

  @Get()
  @ApiOperation({ summary: 'Cambios registrados (los mas recientes primero)' })
  listar(@Query() filtro: FiltroCambiosDto) {
    return this.cambios.listar(filtro.venta_id);
  }

  @Get('venta/:venta_id')
  @ApiOperation({
    summary: 'Datos para cambiar prendas de una venta: plazo, lineas cambiables y prendas disponibles',
  })
  paraVenta(@Param('venta_id', PipeId) ventaId: number, @UsuarioActual() actor: Usuario) {
    return this.cambios.paraVenta(ventaId, actor);
  }

  @Get(':cambio_id')
  @ApiOperation({ summary: 'Detalle de un cambio' })
  obtener(@Param('cambio_id', PipeId) id: number) {
    return this.cambios.obtener(id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Registrar un cambio: devuelve prendas al stock y entrega otras, dentro del plazo de la empresa',
  })
  crear(@Body() datos: CrearCambioDto, @UsuarioActual() actor: Usuario) {
    return this.cambios.crear(datos, actor);
  }
}
