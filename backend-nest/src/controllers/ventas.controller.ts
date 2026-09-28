import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import { Roles } from '../commons/decorators/roles.decorator.js';
import { UsuarioActual } from '../commons/decorators/usuario-actual.decorator.js';
import { CAPACIDAD, Rol } from '../commons/enums/rol.enum.js';
import { PipeId } from '../commons/pipes.js';
import {
  ActualizarVentaDto,
  CrearVentaDto,
  FiltroVentasDto,
} from '../dto/venta.dto.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { VentasService } from '../services/ventas.service.js';

@ApiTags('Ventas')
@ApiBearerAuth()
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  @Roles(...CAPACIDAD.reportes, Rol.CLIENTE)
  @Get()
  @ApiOperation({ summary: 'Listar ventas. El cliente solo ve las suyas' })
  listar(@Query() filtro: FiltroVentasDto, @UsuarioActual() actor: Usuario) {
    return this.ventas.listar(filtro, actor);
  }

  @Roles(...CAPACIDAD.reportes, Rol.CLIENTE)
  @Get(':venta_id')
  @ApiOperation({ summary: 'Obtener una venta con su detalle' })
  obtener(
    @Param('venta_id', PipeId) id: number,
    @UsuarioActual() actor: Usuario,
  ) {
    return this.ventas.obtener(id, actor);
  }

  @Roles(Rol.CLIENTE)
  @Post(':venta_id/comprobante-pago')
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Subir la foto del comprobante del pago por QR (campo "archivo"). Queda por verificar',
  })
  subirComprobantePago(
    @Param('venta_id', PipeId) id: number,
    @UsuarioActual() actor: Usuario,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    if (!archivo) {
      throw new UnprocessableEntityException(
        'Falta la imagen del comprobante en el campo "archivo"',
      );
    }
    return this.ventas.subirComprobantePago(id, archivo, actor);
  }

  @Roles(...CAPACIDAD.reportes, Rol.CLIENTE)
  @Get(':venta_id/comprobante-pago')
  @ApiOperation({
    summary:
      'Ver el comprobante del pago por QR (privado: dueno del pedido y personal)',
  })
  async comprobantePago(
    @Param('venta_id', PipeId) id: number,
    @UsuarioActual() actor: Usuario,
  ) {
    const { ruta, tipo } = await this.ventas.comprobantePago(id, actor);
    return new StreamableFile(createReadStream(ruta), {
      type: tipo,
      disposition: 'inline',
    });
  }

  @Roles(...CAPACIDAD.venta)
  @Post()
  @ApiOperation({
    summary:
      'Registrar una venta. La compra del cliente exige pago por la pasarela',
  })
  crear(@Body() datos: CrearVentaDto, @UsuarioActual() actor: Usuario) {
    return this.ventas.crear(datos, actor);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Put(':venta_id')
  @ApiOperation({ summary: 'Corregir el tipo de una venta' })
  actualizar(
    @Param('venta_id', PipeId) id: number,
    @Body() datos: ActualizarVentaDto,
  ) {
    return this.ventas.actualizar(id, datos);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Delete(':venta_id')
  @ApiOperation({ summary: 'Anular una venta y devolver el stock' })
  anular(
    @Param('venta_id', PipeId) id: number,
    @UsuarioActual() actor: Usuario,
  ) {
    return this.ventas.anular(id, actor);
  }
}
