import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { EstadoEnvio, ModalidadEntrega } from '../commons/enums/envio.enum.js';
import { ComoBooleano } from '../commons/pipes.js';

export class FiltroEnviosDto {
  @IsOptional()
  @IsEnum(EstadoEnvio)
  estado?: EstadoEnvio;

  @IsOptional()
  @IsEnum(ModalidadEntrega)
  modalidad?: ModalidadEntrega;

  @IsOptional()
  @IsInt()
  @Min(1)
  sucursal_id?: number;

  /** Solo pedidos activos (ni entregados ni cancelados). */
  @IsOptional()
  @ComoBooleano()
  @IsBoolean()
  activos?: boolean;
}

export class AvanzarEnvioDto {
  /** Estado al que se quiere pasar; debe ser el siguiente del flujo. */
  @IsEnum(EstadoEnvio)
  estado: EstadoEnvio;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nota?: string | null;
}

export class CancelarEnvioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  motivo: string;
}
