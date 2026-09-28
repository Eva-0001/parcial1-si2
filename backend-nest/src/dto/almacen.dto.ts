import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TipoMovimientoAlmacen } from '../commons/enums/almacen.enum.js';

export class CrearAlmacenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ubicacion?: string | null;

  @IsInt()
  @Min(1)
  ciudad_id: number;
}

export class ActualizarAlmacenDto extends PartialType(CrearAlmacenDto) {}

export class LineaMovimientoAlmacenDto {
  @IsInt()
  @Min(1)
  producto_id: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class CrearMovimientoAlmacenDto {
  @IsEnum(TipoMovimientoAlmacen)
  tipo: TipoMovimientoAlmacen;

  /** Obligatoria en envios y devoluciones; se ignora en un ingreso. */
  @IsOptional()
  @IsInt()
  @Min(1)
  sucursal_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaMovimientoAlmacenDto)
  @ApiProperty({ type: [LineaMovimientoAlmacenDto] })
  detalles: LineaMovimientoAlmacenDto[];
}
