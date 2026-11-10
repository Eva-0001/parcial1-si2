import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Empresa } from './empresa.entity.js';
import { Plan } from './plan.entity.js';

export enum EstadoSuscripcion {
  /** La vigente (una sola por empresa). Si la fecha paso, se informa "vencida". */
  ACTIVA = 'activa',
  /** Quedo de historial al cambiar de plan o renovar. */
  REEMPLAZADA = 'reemplazada',
  CANCELADA = 'cancelada',
  SUSPENDIDA = 'suspendida',
}

@Entity('suscripciones')
export class Suscripcion {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'empresa_id', type: 'int' })
  empresa_id: number;

  @Column({ name: 'plan_id', type: 'int' })
  plan_id: number;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fecha_inicio: string;

  @Column({ name: 'fecha_vencimiento', type: 'date' })
  fecha_vencimiento: string;

  @Column({ name: 'estado', type: 'varchar', length: 20, default: EstadoSuscripcion.ACTIVA })
  estado: EstadoSuscripcion;

  @Column({ name: 'observacion', type: 'varchar', length: 255, nullable: true })
  observacion: string | null;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creada_en: Date;

  @ManyToOne(() => Empresa, (empresa) => empresa.suscripciones)
  @JoinColumn({ name: 'empresa_id' })
  empresa?: Relation<Empresa>;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan?: Relation<Plan>;
}
