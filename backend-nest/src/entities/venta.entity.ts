import { Exclude, Expose, Transform } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { MetodoPago } from '../commons/enums/caja.enum.js';
import { EstadoPago } from '../commons/enums/envio.enum.js';
import { ModalidadVenta, TipoVenta } from '../commons/enums/tipo-venta.enum.js';
import { aIsoSinZona } from '../commons/fechas.js';
import { Comprobante } from './comprobante.entity.js';
import { DetalleVenta } from './detalle-venta.entity.js';
import { Envio } from './envio.entity.js';
import { TurnoCaja } from './turno-caja.entity.js';
import { Usuario } from './usuario.entity.js';

@Entity('ventas')
export class Venta {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({
    name: 'tipo_venta',
    type: 'enum',
    enum: TipoVenta,
    enumName: 'tipo_venta_enum',
  })
  tipo_venta: TipoVenta;

  @Index('ix_ventas_modalidad')
  @Column({
    name: 'modalidad',
    type: 'enum',
    enum: ModalidadVenta,
    enumName: 'modalidad_venta_enum',
    default: ModalidadVenta.MENOR,
  })
  modalidad: ModalidadVenta;

  @Column({
    name: 'total',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  total: string;

  @Index('ix_ventas_pago_id', { unique: true })
  @Column({ name: 'pago_id', type: 'varchar', length: 255, nullable: true })
  pago_id: string | null;

  @Column({
    name: 'metodo_pago',
    type: 'enum',
    enum: MetodoPago,
    enumName: 'metodo_pago_enum',
    nullable: true,
  })
  metodo_pago: MetodoPago | null;

  /** Una contraentrega queda pendiente hasta que se cobra al entregar. */
  @Column({
    name: 'estado_pago',
    type: 'enum',
    enum: EstadoPago,
    enumName: 'estado_pago_enum',
    default: EstadoPago.PAGADO,
  })
  estado_pago: EstadoPago;

  /** Comprobante del pago por QR (clave del archivo privado). No se expone en JSON. */
  @Exclude()
  @Column({
    name: 'comprobante_pago',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  comprobante_pago: string | null;

  /** Si el cliente ya subio el comprobante del pago por QR. */
  @Expose()
  get tiene_comprobante(): boolean {
    return !!this.comprobante_pago;
  }

  /** Pedido online cancelado: el stock volvio y no cuenta en los reportes. */
  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @Column({ name: 'cancelada_en', type: 'timestamp', nullable: true })
  cancelada_en: Date | null;

  @Column({ name: 'usuario_id', type: 'int' })
  usuario_id: number;

  /** UUID que genera el cliente (POS offline) para que reintentar no duplique la venta. */
  @Index('ix_ventas_id_cliente', { unique: true })
  @Column({ name: 'id_cliente', type: 'uuid', nullable: true })
  id_cliente: string | null;

  /** Turno de caja en que se cobro. Solo las ventas presenciales lo tienen. */
  @Index('ix_ventas_turno')
  @Column({ name: 'turno_id', type: 'int', nullable: true })
  turno_id: number | null;

  /** 'en_linea' o 'sin_conexion' (registrada en un equipo sin red y sincronizada despues). */
  @Column({ name: 'origen', type: 'varchar', length: 20, default: 'en_linea' })
  origen: 'en_linea' | 'sin_conexion';

  /** Hora real que informo el equipo, tal cual (creada_en se acota al turno). */
  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @Column({
    name: 'registrada_en_dispositivo',
    type: 'timestamp',
    nullable: true,
  })
  registrada_en_dispositivo: Date | null;

  /** Cuando llego al servidor una venta hecha sin conexion. */
  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @Column({ name: 'sincronizada_en', type: 'timestamp', nullable: true })
  sincronizada_en: Date | null;

  /** Quien autorizo respetar el precio cobrado sin conexion cuando el de lista cambio. */
  @Column({ name: 'precios_autorizados_por', type: 'int', nullable: true })
  precios_autorizados_por: number | null;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @Index('ix_ventas_creada_en')
  @CreateDateColumn({ name: 'creada_en', type: 'timestamp' })
  creada_en: Date;

  @ManyToOne(() => Usuario, (usuario) => usuario.ventas)
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Relation<Usuario> | null;

  @ManyToOne(() => TurnoCaja, (turno) => turno.ventas)
  @JoinColumn({ name: 'turno_id' })
  turno?: Relation<TurnoCaja> | null;

  @OneToMany(() => Comprobante, (comprobante) => comprobante.venta, {
    cascade: true,
  })
  comprobantes?: Relation<Comprobante>[];

  @OneToMany(() => DetalleVenta, (detalle) => detalle.venta, { cascade: true })
  detalles?: Relation<DetalleVenta>[];

  @OneToOne(() => Envio, (envio) => envio.venta)
  envio?: Relation<Envio> | null;
}
