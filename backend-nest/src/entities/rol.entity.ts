import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Usuario } from './usuario.entity.js';

@Entity('roles')
export class Rol {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 50 })
  nombre: string;

  /** Cada empresa tiene sus propios roles; null = rol de la plataforma (superadmin). */
  @Column({ name: 'empresa_id', type: 'int', nullable: true })
  empresa_id: number | null;

  @OneToMany(() => Usuario, (usuario) => usuario.rol)
  usuarios?: Relation<Usuario>[];
}
