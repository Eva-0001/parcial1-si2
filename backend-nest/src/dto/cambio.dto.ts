import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MOTIVOS_DE_CAMBIO = ['talla', 'color', 'defecto', 'no_le_gusto', 'otro'] as const;
export type MotivoDeCambio = (typeof MOTIVOS_DE_CAMBIO)[number];

export class ItemDeCambioDto {
  @ApiProperty({ description: 'Linea de la venta original que el cliente devuelve' })
  @IsInt()
  @Min(1)
  detalle_venta_id: number;

  @IsInt()
  @Min(1)
  cantidad: number;

  @ApiProperty({ description: 'Stock (producto en la sucursal) que el cliente se lleva a cambio' })
  @IsInt()
  @Min(1)
  producto_sucursal_nuevo_id: number;
}

export class CrearCambioDto {
  @IsInt()
  @Min(1)
  venta_id: number;

  @IsIn(MOTIVOS_DE_CAMBIO)
  motivo: MotivoDeCambio;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  observacion?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemDeCambioDto)
  @ApiProperty({ type: [ItemDeCambioDto] })
  items: ItemDeCambioDto[];
}

export class FiltroCambiosDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  venta_id?: number;
}
