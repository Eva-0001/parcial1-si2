import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SoloPlataforma } from '../commons/decorators/plataforma.decorator.js';
import { PipeId } from '../commons/pipes.js';
import {
  ActualizarPlanDto,
  CambiarPlanDto,
  CrearPlanDto,
  EstadoEmpresaDto,
  RenovarSuscripcionDto,
} from '../dto/empresa.dto.js';
import { EmpresasService } from '../services/empresas.service.js';

/** Administracion de la plataforma SaaS: solo el superadmin. */
@ApiTags('Plataforma (superadmin)')
@ApiBearerAuth()
@SoloPlataforma()
@Controller('plataforma')
export class PlataformaController {
  constructor(private readonly empresas: EmpresasService) {}

  @Get('empresas')
  @ApiOperation({ summary: 'Empresas con su plan, vencimiento y uso' })
  listar() {
    return this.empresas.resumenPlataforma();
  }

  @Get('empresas/:id')
  @ApiOperation({ summary: 'Detalle de una empresa' })
  detalle(@Param('id', PipeId) id: number) {
    return this.empresas.resumen(id);
  }

  @Get('empresas/:id/suscripciones')
  @ApiOperation({ summary: 'Historial de suscripciones de una empresa' })
  historial(@Param('id', PipeId) id: number) {
    return this.empresas.historial(id);
  }

  @Patch('empresas/:id/estado')
  @ApiOperation({ summary: 'Activar o suspender una empresa' })
  estado(@Param('id', PipeId) id: number, @Body() datos: EstadoEmpresaDto) {
    return this.empresas.cambiarEstado(id, datos.estado);
  }

  @Post('empresas/:id/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asignar o cambiar el plan de una empresa' })
  asignarPlan(@Param('id', PipeId) id: number, @Body() datos: CambiarPlanDto) {
    return this.empresas.cambiarPlan(id, datos, 'plataforma');
  }

  @Post('empresas/:id/renovar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar la suscripcion de una empresa' })
  renovar(@Param('id', PipeId) id: number, @Body() datos: RenovarSuscripcionDto) {
    return this.empresas.renovar(id, datos.meses ?? 1, 'plataforma');
  }

  @Get('planes')
  @ApiOperation({ summary: 'Todos los planes, incluso los desactivados' })
  planes() {
    return this.empresas.listarPlanes(false);
  }

  @Post('planes')
  @ApiOperation({ summary: 'Crear un plan' })
  crearPlan(@Body() datos: CrearPlanDto) {
    return this.empresas.crearPlan(datos);
  }

  @Put('planes/:id')
  @ApiOperation({ summary: 'Configurar limites y funciones de un plan' })
  actualizarPlan(@Param('id', PipeId) id: number, @Body() datos: ActualizarPlanDto) {
    return this.empresas.actualizarPlan(id, datos);
  }
}
