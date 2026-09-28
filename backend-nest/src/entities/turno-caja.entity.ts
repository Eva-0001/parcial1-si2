import { Transform } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { aIsoSinZona } from '../commons/fechas.js';
import { MovimientoCaja } from './movimiento-caja.entity.js';
import { Sucursal } from './sucursal.entity.js';
import { Usuario } from './usuario.entity.js';
import { Venta } from './venta.entity.js';

@Entity('turnos_caja')
export class TurnoCaja {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Index('ix_turnos_caja_sucursal')
  @Column({ name: 'sucursal_id', type: 'int' })
  sucursal_id: number;

  @Column({ name: 'cajero_id', type: 'int' })
  cajero_id: number;

  @Column({ name: 'monto_inicial', type: 'numeric', precision: 10, scale: 2 })
  monto_inicial: string;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @Index('ix_turnos_caja_abierto_en')
  @CreateDateColumn({ name: 'abierto_en', type: 'timestamp' })
  abierto_en: Date;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @Column({ name: 'cerrado_en', type: 'timestamp', nullable: true })
  cerrado_en: Date | null;

  /** Se congela al cerrar: monto inicial + ventas en efectivo + ingresos - egresos. */
  @Column({
    name: 'efectivo_esperado',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  efectivo_esperado: string | null;

  @Column({
    name: 'efectivo_contado',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  efectivo_contado: string | null;

  /** contado - esperado: negativo es faltante, positivo sobrante. */
  @Column({
    name: 'diferencia',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  diferencia: string | null;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion: string | null;

  @ManyToOne(() => Sucursal)
  @JoinColumn({ name: 'sucursal_id' })
  sucursal?: Relation<Sucursal> | null;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'cajero_id' })
  cajero?: Relation<Usuario> | null;

  @OneToMany(() => MovimientoCaja, (movimiento) => movimiento.turno)
  movimientos?: Relation<MovimientoCaja>[];

  @OneToMany(() => Venta, (venta) => venta.turno)
  ventas?: Relation<Venta>[];
}
