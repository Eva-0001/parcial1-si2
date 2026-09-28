import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Sucursal } from './sucursal.entity.js';

@Entity('ciudades')
export class Ciudad {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 100, unique: true })
  nombre: string;

  /** Tarifa de envio a domicilio hacia esta ciudad. Nula = sin cobertura. */
  @Column({
    name: 'costo_envio',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  costo_envio: string | null;

  @OneToMany(() => Sucursal, (sucursal) => sucursal.ciudad)
  sucursales?: Relation<Sucursal>[];
}
