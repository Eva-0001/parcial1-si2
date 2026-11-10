import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Roles } from '../commons/decorators/roles.decorator.js';
import { Rol } from '../commons/enums/rol.enum.js';
import { MlService } from '../services/ml.service.js';

class EntrenarDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: 'Volver a generar los datos sinteticos antes de entrenar' })
  regenerar?: boolean;
}

@ApiTags('Analitica inteligente (ML)')
@ApiBearerAuth()
@Controller('ml')
export class MlController {
  constructor(private readonly ml: MlService) {}

  @Roles(Rol.ADMINISTRADOR, Rol.ENCARGADO)
  @Get('resumen')
  @ApiOperation({ summary: 'Datos, modelos vigentes con sus metricas, predicciones, segmentos y anomalias' })
  resumen() {
    return this.ml.resumen();
  }

  @Roles(Rol.ADMINISTRADOR)
  @Post('entrenar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Entrenar los modelos de demanda (Random Forest) y segmentacion (K-means)' })
  entrenar(@Body() datos: EntrenarDto) {
    return this.ml.entrenar(datos.regenerar === true);
  }

  @Roles(Rol.ADMINISTRADOR)
  @Post('datos-sinteticos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generar el historial sintetico de demanda y clientes' })
  generar() {
    return this.ml.generarDatos();
  }

  @Roles(Rol.ADMINISTRADOR, Rol.ENCARGADO)
  @Get('predicciones')
  @ApiOperation({ summary: 'Pronostico de demanda de las proximas 4 semanas y reposicion sugerida' })
  async predicciones() {
    const modelo = await this.ml.exigirModelo('demanda');
    return {
      version: modelo.version,
      entrenado_en: modelo.entrenado_en,
      metricas: modelo.metricas,
      pronostico: modelo.resultados.pronostico,
      reposicion: modelo.resultados.reposicion,
    };
  }

  @Roles(Rol.ADMINISTRADOR, Rol.ENCARGADO)
  @Get('segmentos')
  @ApiOperation({ summary: 'Segmentos de clientes y a cual pertenece cada cliente real' })
  async segmentos() {
    const modelo = await this.ml.exigirModelo('segmentos');
    return { version: modelo.version, entrenado_en: modelo.entrenado_en, metricas: modelo.metricas, ...modelo.resultados };
  }
}
