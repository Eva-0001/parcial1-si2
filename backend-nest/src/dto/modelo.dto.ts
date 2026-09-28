import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ComoBooleano, ComoMonto } from '../commons/pipes.js';

const MONTO = /^\d{1,8}(\.\d{1,2})?$/;
const MENSAJE_MONTO =
  'debe ser un monto positivo con hasta 2 decimales, por ejemplo "120.50"';
const SKU = /^[A-Za-z0-9._-]{2,60}$/;

/** Una combinacion talla x color. Sin precio, hereda el del modelo. */
export class VarianteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  color_id?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  talla_id?: number | null;

  @IsOptional()
  @ComoMonto()
  @Matches(MONTO, { message: `precio ${MENSAJE_MONTO}` })
  precio?: string;

  /** Sin sku se genera uno (FS-000123). */
  @IsOptional()
  @Matches(SKU, {
    message: 'sku: de 2 a 60 caracteres, solo letras, numeros, punto, guion',
  })
  sku?: string;
}

export class CrearModeloDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string | null;

  @ComoMonto()
  @Matches(MONTO, { message: `precio ${MENSAJE_MONTO}` })
  precio: string;

  @IsOptional()
  @ComoMonto()
  @Matches(MONTO, { message: `precio_mayor ${MENSAJE_MONTO}` })
  precio_mayor?: string | null;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  minimo_mayor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoria_id?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  coleccion_id?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  temporada_id?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  proveedor_id?: number | null;

  /** Variantes a crear junto con el modelo (por ejemplo, la matriz tallas x colores). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VarianteDto)
  @ApiProperty({ type: [VarianteDto], required: false })
  variantes?: VarianteDto[];
}

export class ActualizarModeloDto extends PartialType(
  OmitType(CrearModeloDto, ['variantes'] as const),
) {
  /** true copia el precio del modelo a todas sus variantes. */
  @IsOptional()
  @ComoBooleano()
  @IsBoolean()
  aplicar_precio?: boolean;
}

export class FiltroModelosDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoria_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  proveedor_id?: number;
}
