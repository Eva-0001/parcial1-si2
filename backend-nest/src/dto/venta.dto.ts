import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ModalidadEntrega } from '../commons/enums/envio.enum.js';
import { MetodoPago } from '../commons/enums/caja.enum.js';
import { TipoVenta } from '../commons/enums/tipo-venta.enum.js';

export class DetalleDeVentaDto {
  @IsInt()
  @Min(1)
  producto_sucursal_id: number;

  @IsInt()
  @Min(1)
  cantidad: number;

  /**
   * Precio unitario que se cobro (venta sin conexion). Si no coincide con el del
   * servidor, la venta queda en conflicto hasta que admin o encargado la autorice.
   */
  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, {
    message: 'precio debe ser un monto en Bs (ej. 150.00)',
  })
  precio?: string;
}

/** Como recibe el cliente el pedido online. Con domicilio, los datos de entrega son obligatorios. */
export class EntregaDto {
  @IsEnum(ModalidadEntrega)
  modalidad: ModalidadEntrega;

  @ValidateIf((o: EntregaDto) => o.modalidad === ModalidadEntrega.DOMICILIO)
  @IsInt()
  @Min(1)
  ciudad_id?: number;

  @ValidateIf((o: EntregaDto) => o.modalidad === ModalidadEntrega.DOMICILIO)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  referencia?: string | null;

  @ValidateIf((o: EntregaDto) => o.modalidad === ModalidadEntrega.DOMICILIO)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  destinatario?: string;

  @ValidateIf((o: EntregaDto) => o.modalidad === ModalidadEntrega.DOMICILIO)
  @Matches(/^\+?\d{6,15}$/, {
    message: 'telefono debe tener solo numeros (6 a 15 digitos)',
  })
  telefono?: string;
}

/** Usuario y contrasena del supervisor que autoriza un precio distinto (no se guardan). */
export class AutorizacionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password: string;
}

export class CrearVentaDto {
  @IsEnum(TipoVenta)
  tipo_venta: TipoVenta;

  @IsInt()
  @Min(1)
  usuario_id: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleDeVentaDto)
  @ApiProperty({ type: [DetalleDeVentaDto] })
  detalles: DetalleDeVentaDto[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^pi_[A-Za-z0-9_]+$/, {
    message:
      'pago_id debe ser el id de una intencion de pago de Stripe (pi_...)',
  })
  pago_id?: string;

  /** Obligatorio en la venta presencial. Con pago_id siempre es tarjeta. */
  @IsOptional()
  @IsEnum(MetodoPago)
  metodo_pago?: MetodoPago;

  /** Generado por el cliente: si la misma venta llega dos veces, se devuelve la primera. */
  @IsOptional()
  @IsUUID()
  id_cliente?: string;

  /**
   * Momento real del cobro de una venta hecha sin conexion. Solo en ventas presenciales;
   * se acota al periodo del turno abierto.
   */
  @IsOptional()
  @IsDateString()
  registrada_en?: string;

  /** Total cobrado en el equipo sin conexion; tiene que coincidir con sus lineas. */
  @IsOptional()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, {
    message: 'total debe ser un monto en Bs (ej. 300.00)',
  })
  total?: string;

  /** Respetar los precios cobrados aunque hayan cambiado (lo autoriza un administrador o encargado). */
  @IsOptional()
  @IsBoolean()
  respetar_precios?: boolean;

  /** Supervisor que autoriza respetar los precios cuando quien envia es cajero. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AutorizacionDto)
  autorizacion?: AutorizacionDto;

  /** Solo venta virtual. Si se omite, el pedido se retira en la sucursal. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EntregaDto)
  entrega?: EntregaDto;
}

export class ActualizarVentaDto extends PartialType(
  PickType(CrearVentaDto, ['tipo_venta'] as const),
) {}

export class FiltroVentasDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  usuario_id?: number;

  @IsOptional()
  @IsEnum(TipoVenta)
  tipo_venta?: TipoVenta;
}

export class CrearIntencionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleDeVentaDto)
  @ApiProperty({ type: [DetalleDeVentaDto] })
  detalles: DetalleDeVentaDto[];

  /** Para sumar el costo de envio al monto que se cobra. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EntregaDto)
  entrega?: EntregaDto;
}
