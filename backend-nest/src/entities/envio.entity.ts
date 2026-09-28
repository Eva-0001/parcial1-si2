import { Transform } from 'class-transformer';
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
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { EstadoEnvio, ModalidadEntrega } from '../commons/enums/envio.enum.js';
import { aIsoSinZona } from '../commons/fechas.js';
import { Ciudad } from './ciudad.entity.js';
import { EventoEnvio } from './evento-envio.entity.js';
import { Sucursal } from './sucursal.entity.js';
import { Venta } from './venta.entity.js';

/** Entrega de un pedido online: retiro en sucursal o envio a domicilio. */
@Entity('envios')
export class Envio {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Index('ux_envios_venta', { unique: true })
  @Column({ name: 'venta_id', type: 'int' })
  venta_id: number;

  @Column({
    name: 'modalidad',
    type: 'enum',
    enum: ModalidadEntrega,
    enumName: 'modalidad_entrega_enum',
  })
  modalidad: ModalidadEntrega;

  @Index('ix_envios_estado')
  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoEnvio,
    enumName: 'estado_envio_enum',
    default: EstadoEnvio.PENDIENTE,
  })
  estado: EstadoEnvio;

  /** Sucursal que despacha el pedido (la del stock vendido). */
  @Index('ix_envios_sucursal')
  @Column({ name: 'sucursal_id', type: 'int' })
  sucursal_id: number;

  @Column({ name: 'ciudad_id', type: 'int', nullable: true })
  ciudad_id: number | null;

  @Column({ name: 'direccion', type: 'varchar', length: 255, nullable: true })
  direccion: string | null;

  @Column({ name: 'referencia', type: 'varchar', length: 255, nullable: true })
  referencia: string | null;

  @Column({
    name: 'destinatario',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  destinatario: string | null;

  @Column({ name: 'telefono', type: 'varchar', length: 20, nullable: true })
  telefono: string | null;

  @Column({
    name: 'costo',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  costo: string;

  @Column({ name: 'motivo_cancelacion', type: 'text', nullable: true })
  motivo_cancelacion: string | null;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @CreateDateColumn({ name: 'creado_en', type: 'timestamp' })
  creado_en: Date;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamp' })
  actualizado_en: Date;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @Column({ name: 'entregado_en', type: 'timestamp', nullable: true })
  entregado_en: Date | null;

  @OneToOne(() => Venta, (venta) => venta.envio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta?: Relation<Venta> | null;

  @ManyToOne(() => Sucursal)
  @JoinColumn({ name: 'sucursal_id' })
  sucursal?: Relation<Sucursal> | null;

  @ManyToOne(() => Ciudad)
  @JoinColumn({ name: 'ciudad_id' })
  ciudad?: Relation<Ciudad> | null;

  @OneToMany(() => EventoEnvio, (evento) => evento.envio, { cascade: true })
  eventos?: Relation<EventoEnvio>[];
}
