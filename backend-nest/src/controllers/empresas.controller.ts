import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SinVerificarSuscripcion } from '../commons/decorators/plan.decorator.js';
import { Publico } from '../commons/decorators/publico.decorator.js';
import { Roles } from '../commons/decorators/roles.decorator.js';
import { UsuarioActual } from '../commons/decorators/usuario-actual.decorator.js';
import { Rol } from '../commons/enums/rol.enum.js';
import { empresaActualId } from '../commons/tenant/contexto-tenant.js';
import {
  ActualizarEmpresaDto,
  CambiarPlanDto,
  RegistrarEmpresaDto,
  RenovarSuscripcionDto,
} from '../dto/empresa.dto.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { EmpresasService } from '../services/empresas.service.js';

@ApiTags('Empresas (SaaS)')
@Controller()
export class EmpresasController {
  constructor(private readonly empresas: EmpresasService) {}

  @Publico()
  @Get('planes')
  @ApiOperation({ summary: 'Planes disponibles para contratar' })
  planes() {
    return this.empresas.listarPlanes(true);
  }

  @Publico()
  @Post('empresas/registro')
  @ApiOperation({
    summary:
      'Registrar una empresa: crea su espacio de trabajo y devuelve la sesion de su administrador',
  })
  registrar(@Body() datos: RegistrarEmpresaDto) {
    return this.empresas.registrar(datos);
  }

  @Publico()
  @Get('empresas/publica/:slug')
  @ApiOperation({ summary: 'Nombre publico de una tienda (antes del login)' })
  publica(@Param('slug') slug: string) {
    return this.empresas.publica(slug);
  }

  // -------------------------------------------- empresa del usuario actual

  @ApiBearerAuth()
  @SinVerificarSuscripcion()
  @Get('empresa/actual')
  @ApiOperation({ summary: 'Mi empresa: plan, vencimiento, limites y uso' })
  actual() {
    return this.empresas.resumen(empresaActualId());
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR)
  @SinVerificarSuscripcion()
  @Get('empresa/suscripciones')
  @ApiOperation({ summary: 'Historial de suscripciones de mi empresa' })
  historial() {
    return this.empresas.historial(empresaActualId());
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR)
  @Put('empresa/actual')
  @ApiOperation({ summary: 'Editar los datos de mi empresa' })
  actualizar(@Body() datos: ActualizarEmpresaDto) {
    return this.empresas.actualizarDatos(empresaActualId(), datos);
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR)
  @SinVerificarSuscripcion()
  @Post('empresa/suscripcion/cambiar-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar de plan (pago simulado)' })
  cambiarPlan(@Body() datos: CambiarPlanDto, @UsuarioActual() usuario: Usuario) {
    return this.empresas.cambiarPlan(empresaActualId(), datos, usuario.username);
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR)
  @SinVerificarSuscripcion()
  @Post('empresa/suscripcion/renovar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar la suscripcion (pago simulado)' })
  renovar(@Body() datos: RenovarSuscripcionDto, @UsuarioActual() usuario: Usuario) {
    return this.empresas.renovar(empresaActualId(), datos.meses ?? 1, usuario.username);
  }
}
