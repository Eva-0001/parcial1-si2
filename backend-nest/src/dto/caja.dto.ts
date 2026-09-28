import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { TipoMovimientoCaja } from '../commons/enums/caja.enum.js';
import { ComoMonto } from '../commons/pipes.js';
import { EsFecha } from '../commons/validadores/fecha.validator.js';

const MONTO = /^\d{1,8}(\.\d{1,2})?$/;

const MENSAJE_MONTO =
  'debe ser un monto positivo con hasta 2 decimales, por ejemplo "120.50"';

export class AbrirTurnoDto {
  @IsInt()
  @Min(1)
  sucursal_id: number;

  @ComoMonto()
  @Matches(MONTO, { message: `monto_inicial ${MENSAJE_MONTO}` })
  monto_inicial: string;
}

export class MovimientoCajaDto {
  @IsEnum(TipoMovimientoCaja)
  tipo: TipoMovimientoCaja;

  @ComoMonto()
  @Matches(MONTO, { message: `monto ${MENSAJE_MONTO}` })
  monto: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  motivo: string;
}

export class CerrarTurnoDto {
  @ComoMonto()
  @Matches(MONTO, { message: `efectivo_contado ${MENSAJE_MONTO}` })
  efectivo_contado: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string | null;
}

export class FiltroTurnosDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  sucursal_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cajero_id?: number;

  @IsOptional()
  @EsFecha()
  desde?: string;

  @IsOptional()
  @EsFecha()
  hasta?: string;
}
