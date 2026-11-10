import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CrearUsuarioDto } from './usuario.dto.js';
import { EstadoEmpresa } from '../entities/empresa.entity.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class AdministradorEmpresaDto extends OmitType(CrearUsuarioDto, [
  'rol_id',
] as const) {}

/** Alta publica de una empresa: crea su espacio de trabajo completo. */
export class RegistrarEmpresaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  @ApiProperty({
    example: 'urban-wear',
    description: 'Identificador de la tienda: minusculas, numeros y guiones',
  })
  @IsString()
  @MaxLength(60)
  @Matches(SLUG, { message: 'El identificador solo admite minusculas, numeros y guiones' })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiProperty({ example: 'basico' })
  @IsString()
  @IsNotEmpty()
  plan: string;

  @ApiPropertyOptional({ example: 'Santa Cruz' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ciudad?: string;

  @ApiPropertyOptional({ example: 'Casa matriz' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sucursal?: string;

  @ValidateNested()
  @Type(() => AdministradorEmpresaDto)
  administrador: AdministradorEmpresaDto;
}

export class ActualizarEmpresaDto extends PartialType(
  OmitType(RegistrarEmpresaDto, ['slug', 'plan', 'ciudad', 'sucursal', 'administrador'] as const),
) {
  @ApiPropertyOptional({ description: 'Dias que tiene el cliente para cambiar una prenda' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dias_para_cambios?: number;
}

export class CambiarPlanDto {
  @ApiProperty({ example: 'profesional' })
  @IsString()
  @IsNotEmpty()
  plan: string;

  @ApiPropertyOptional({ default: 1, description: 'Meses contratados (pago simulado)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  meses?: number;
}

export class RenovarSuscripcionDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  meses?: number;
}

export class EstadoEmpresaDto {
  @IsIn(Object.values(EstadoEmpresa))
  estado: EstadoEmpresa;
}

export class CrearPlanDto {
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  @MaxLength(30)
  codigo: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio_mensual: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  max_sucursales: number;

  @IsOptional() @IsBoolean() gestion_productos?: boolean;
  @IsOptional() @IsBoolean() gestion_ventas?: boolean;
  @IsOptional() @IsBoolean() reservas?: boolean;
  @IsOptional() @IsBoolean() operacion_offline?: boolean;
  @IsOptional() @IsBoolean() reportes_convencionales?: boolean;
  @IsOptional() @IsBoolean() reportes_ia?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class ActualizarPlanDto extends PartialType(
  OmitType(CrearPlanDto, ['codigo'] as const),
) {}
