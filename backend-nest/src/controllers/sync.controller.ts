import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../commons/decorators/publico.decorator.js';
import { Roles } from '../commons/decorators/roles.decorator.js';
import { Rol } from '../commons/enums/rol.enum.js';
import { UsuarioActual } from '../commons/decorators/usuario-actual.decorator.js';
import { FiltroRegistroSyncDto, FiltroSyncDto, FiltroTiendaDto, SyncPushDto } from '../dto/sync.dto.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { SyncService } from '../services/sync.service.js';

@ApiTags('Sincronizacion')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Publico()
  @Get('catalogo')
  @ApiOperation({
    summary:
      'Cambios del catalogo (productos, stock, sucursales y catalogos) desde una fecha, para la copia local del movil',
  })
  catalogo(@Query() filtro: FiltroSyncDto) {
    return this.sync.catalogo(filtro.desde);
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR, Rol.ENCARGADO, Rol.CAJERO)
  @Get('tienda')
  @ApiOperation({
    summary:
      'Paquete para operar sin conexion desde el movil del vendedor: sucursales autorizadas, ' +
      'prendas con su stock en la sucursal elegida, clientes y turno de caja abierto',
  })
  tienda(@Query() filtro: FiltroTiendaDto, @UsuarioActual() usuario: Usuario) {
    return this.sync.tienda(usuario, filtro.sucursal_id);
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR, Rol.ENCARGADO, Rol.CAJERO, Rol.CLIENTE)
  @Post('push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sincronizacion por lote: registra ventas y reservas hechas sin conexion y devuelve el resultado ' +
      'de cada una (confirmada, duplicada, rechazada, conflicto o error para reintentar)',
  })
  push(@Body() datos: SyncPushDto, @UsuarioActual() usuario: Usuario) {
    return this.sync.push(datos, usuario);
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR, Rol.ENCARGADO)
  @Get('registro')
  @ApiOperation({ summary: 'Registro del servidor de las operaciones sincronizadas (ultimas 200)' })
  registro(@Query() filtro: FiltroRegistroSyncDto) {
    return this.sync.registro(filtro.resultado);
  }

  @ApiBearerAuth()
  @Get('mis-datos')
  @ApiOperation({
    summary:
      'Reservas y compras del usuario autenticado cambiadas desde una fecha',
  })
  misDatos(@Query() filtro: FiltroSyncDto, @UsuarioActual() usuario: Usuario) {
    return this.sync.misDatos(usuario, filtro.desde);
  }
}
