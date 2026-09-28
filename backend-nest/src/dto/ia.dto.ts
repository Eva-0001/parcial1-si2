import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RecomendacionesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  sucursal_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoria_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  talla_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  preferencias?: string;
}

/** Un mensaje anterior del chat, para que el asistente entienda los seguimientos. */
export class TurnoDeChatDto {
  @IsIn(['cliente', 'asistente'])
  rol: 'cliente' | 'asistente';

  @IsString()
  @MaxLength(1500)
  texto: string;
}

export class AsistenteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  mensaje: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sucursal_id?: number;

  /** Ultimos mensajes de la conversacion, del mas viejo al mas nuevo (se usan los 12 ultimos). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TurnoDeChatDto)
  @ApiProperty({ type: [TurnoDeChatDto], required: false })
  historial?: TurnoDeChatDto[];
}

export class ReporteIaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  pregunta: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sucursal_id?: number;
}
