import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Suscripcion } from './suscripcion.entity.js';

export enum EstadoEmpresa {
  ACTIVA = 'activa',
  SUSPENDIDA = 'suspendida',
}

/** Empresa contratante (tenant) de la plataforma FashionStore. */
@Entity('empresas')
export class Empresa {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 120 })
  nombre: string;

  /** Identificador publico en la URL de la tienda (ej. "urban-wear"). */
  @Column({ name: 'slug', type: 'varchar', length: 60, unique: true })
  slug: string;

  @Column({ name: 'nit', type: 'varchar', length: 30, nullable: true })
  nit: string | null;

  @Column({ name: 'correo', type: 'varchar', length: 150, nullable: true })
  correo: string | null;

  @Column({ name: 'telefono', type: 'varchar', length: 30, nullable: true })
  telefono: string | null;

  /** Dias que tiene el cliente para cambiar una prenda desde la compra. */
  @Column({ name: 'dias_para_cambios', type: 'int', default: 15 })
  dias_para_cambios: number;

  @Column({ name: 'estado', type: 'varchar', length: 20, default: EstadoEmpresa.ACTIVA })
  estado: EstadoEmpresa;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creada_en: Date;

  @OneToMany(() => Suscripcion, (suscripcion) => suscripcion.empresa)
  suscripciones?: Relation<Suscripcion>[];
}
