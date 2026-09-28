import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ComoBooleano, ComoMonto } from '../commons/pipes.js';
import { VarianteDto } from './modelo.dto.js';

const MONTO = /^\d{1,8}(\.\d{1,2})?$/;

const MENSAJE_MONTO =
  'debe ser un monto positivo con hasta 2 decimales, por ejemplo "120.50"';

/**
 * Variante nueva de un modelo. Nombre, categoria, proveedor y precio por mayor salen
 * del modelo; aca solo va lo propio de la variante.
 */
export class CrearProductoDto extends VarianteDto {
  @IsInt()
  @Min(1)
  modelo_id: number;
}

/** Solo lo propio de la variante: lo comun se edita en el modelo. */
export class ActualizarProductoDto extends PartialType(VarianteDto) {}

export class FiltroProductosDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  modelo_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoria_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  coleccion_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  color_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  talla_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  temporada_id?: number;
}

export class CrearStockDto {
  @IsInt()
  @Min(0)
  cantidad: number;

  @ComoMonto()
  @Matches(MONTO, { message: `precio ${MENSAJE_MONTO}` })
  precio: string;

  @IsInt()
  @Min(1)
  producto_id: number;

  @IsInt()
  @Min(1)
  sucursal_id: number;
}

export class ActualizarStockDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  cantidad?: number;

  @IsOptional()
  @ComoMonto()
  @Matches(MONTO, { message: `precio ${MENSAJE_MONTO}` })
  precio?: string;
}

export class FiltroStockDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  producto_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sucursal_id?: number;

  @IsOptional()
  @ComoBooleano()
  @IsBoolean()
  solo_disponibles?: boolean;
}
