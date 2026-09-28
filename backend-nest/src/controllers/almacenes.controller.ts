import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../commons/decorators/roles.decorator.js';
import { UsuarioActual } from '../commons/decorators/usuario-actual.decorator.js';
import { CAPACIDAD, Rol } from '../commons/enums/rol.enum.js';
import { PipeId } from '../commons/pipes.js';
import {
  ActualizarAlmacenDto,
  CrearAlmacenDto,
  CrearMovimientoAlmacenDto,
} from '../dto/almacen.dto.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { AlmacenesService } from '../services/almacenes.service.js';

@ApiTags('Almacenes')
@ApiBearerAuth()
@Controller('almacenes')
export class AlmacenesController {
  constructor(private readonly almacenes: AlmacenesService) {}

  @Roles(...CAPACIDAD.inventario)
  @Get()
  @ApiOperation({
    summary: 'Listar almacenes con sus productos distintos y unidades totales',
  })
  listar() {
    return this.almacenes.listar();
  }

  @Roles(...CAPACIDAD.inventario)
  @Get(':almacen_id')
  @ApiOperation({ summary: 'Obtener un almacen con su ciudad' })
  obtener(@Param('almacen_id', PipeId) id: number) {
    return this.almacenes.obtener(id);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Post()
  @ApiOperation({ summary: 'Crear un almacen' })
  crear(@Body() datos: CrearAlmacenDto) {
    return this.almacenes.crear(datos);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Put(':almacen_id')
  @ApiOperation({ summary: 'Actualizar un almacen' })
  actualizar(
    @Param('almacen_id', PipeId) id: number,
    @Body() datos: ActualizarAlmacenDto,
  ) {
    return this.almacenes.actualizar(id, datos);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Delete(':almacen_id')
  @ApiOperation({ summary: 'Eliminar un almacen sin movimientos' })
  eliminar(@Param('almacen_id', PipeId) id: number) {
    return this.almacenes.eliminar(id);
  }

  @Roles(...CAPACIDAD.inventario)
  @Get(':almacen_id/stock')
  @ApiOperation({ summary: 'Stock del almacen por producto' })
  stock(@Param('almacen_id', PipeId) id: number) {
    return this.almacenes.stock(id);
  }

  @Roles(...CAPACIDAD.inventario)
  @Get(':almacen_id/movimientos')
  @ApiOperation({
    summary:
      'Ultimos movimientos del almacen (ingresos, envios y devoluciones)',
  })
  movimientos(@Param('almacen_id', PipeId) id: number) {
    return this.almacenes.movimientos(id);
  }

  @Roles(...CAPACIDAD.inventario)
  @Post(':almacen_id/movimientos')
  @ApiOperation({
    summary:
      'Ingreso de mercaderia, envio a una sucursal o devolucion desde una sucursal',
  })
  registrarMovimiento(
    @Param('almacen_id', PipeId) id: number,
    @Body() datos: CrearMovimientoAlmacenDto,
    @UsuarioActual() actor: Usuario,
  ) {
    return this.almacenes.registrarMovimiento(id, datos, actor);
  }
}
