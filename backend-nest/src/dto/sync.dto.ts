import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FiltroSyncDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  @ApiProperty({
    required: false,
    description:
      'El valor "hasta" de la sincronizacion anterior. Sin el, se devuelve la copia completa',
  })
  desde?: string;
}

export class FiltroTiendaDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({
    required: false,
    description: 'Sucursal a descargar. Sin ella, la primera autorizada',
  })
  sucursal_id?: number;
}

export const TIPOS_DE_OPERACION = ['venta', 'reserva'] as const;
export type TipoDeOperacion = (typeof TIPOS_DE_OPERACION)[number];

/** Una operacion hecha sin conexion que el cliente envia para registrar. */
export class OperacionSyncDto {
  @ApiProperty({ description: 'UUID generado en el dispositivo; se usa como id_cliente (idempotencia)' })
  @IsUUID()
  id: string;

  @IsIn(TIPOS_DE_OPERACION)
  tipo: TipoDeOperacion;

  @ApiProperty({
    required: false,
    description: 'Sucursal donde se hizo la operacion; sin ella se deduce de las prendas',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sucursal_id?: number;

  @ApiProperty({ required: false, description: 'Empresa (slug) del dispositivo; tiene que ser la del usuario' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  empresa?: string;

  @ApiProperty({ required: false, description: 'Numero de intento de envio de esta operacion' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  intento?: number;

  @ApiProperty({ description: 'Cuerpo de POST /ventas o POST /reservas (sin id_cliente)' })
  @IsObject()
  datos: Record<string, unknown>;
}

export class SyncPushDto {
  @ApiProperty({ required: false, description: 'Identificador del dispositivo, para el registro' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dispositivo?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OperacionSyncDto)
  @ApiProperty({ type: [OperacionSyncDto] })
  operaciones: OperacionSyncDto[];
}

export class FiltroRegistroSyncDto {
  @IsOptional()
  @IsIn(['confirmada', 'duplicada', 'rechazada', 'conflicto', 'error'])
  resultado?: string;
}
