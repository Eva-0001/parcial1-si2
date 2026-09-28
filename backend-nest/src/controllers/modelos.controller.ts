import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../commons/decorators/publico.decorator.js';
import { Roles } from '../commons/decorators/roles.decorator.js';
import { CAPACIDAD, Rol } from '../commons/enums/rol.enum.js';
import { PipeId } from '../commons/pipes.js';
import {
  ActualizarModeloDto,
  CrearModeloDto,
  FiltroModelosDto,
  VarianteDto,
} from '../dto/modelo.dto.js';
import { ModelosService } from '../services/modelos.service.js';

@ApiTags('Productos (modelos y variantes)')
@Controller('modelos')
export class ModelosController {
  constructor(private readonly modelos: ModelosService) {}

  @Publico()
  @Get()
  @ApiOperation({
    summary: 'Productos base con sus variantes y stock total (publico)',
  })
  listar(@Query() filtro: FiltroModelosDto) {
    return this.modelos.listar(filtro);
  }

  @Publico()
  @Get(':modelo_id')
  @ApiOperation({ summary: 'Producto base con sus variantes (publico)' })
  obtener(@Param('modelo_id', PipeId) id: number) {
    return this.modelos.obtener(id);
  }

  @Roles(...CAPACIDAD.catalogo)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({
    summary: 'Crear un producto base, opcionalmente con su matriz de variantes',
  })
  crear(@Body() datos: CrearModeloDto) {
    return this.modelos.crear(datos);
  }

  @Roles(...CAPACIDAD.catalogo)
  @ApiBearerAuth()
  @Put(':modelo_id')
  @ApiOperation({
    summary:
      'Actualizar el producto base: los datos comunes se copian a sus variantes',
  })
  actualizar(
    @Param('modelo_id', PipeId) id: number,
    @Body() datos: ActualizarModeloDto,
  ) {
    return this.modelos.actualizar(id, datos);
  }

  @Roles(Rol.ADMINISTRADOR)
  @ApiBearerAuth()
  @Delete(':modelo_id')
  @ApiOperation({
    summary: 'Eliminar el producto base y sus variantes (si no tienen stock)',
  })
  eliminar(@Param('modelo_id', PipeId) id: number) {
    return this.modelos.eliminar(id);
  }

  @Roles(...CAPACIDAD.catalogo)
  @ApiBearerAuth()
  @Post(':modelo_id/variantes')
  @ApiOperation({ summary: 'Agregar una variante (talla x color)' })
  agregarVariante(
    @Param('modelo_id', PipeId) id: number,
    @Body() datos: VarianteDto,
  ) {
    return this.modelos.agregarVariante(id, datos);
  }
}
