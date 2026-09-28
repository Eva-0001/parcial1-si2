import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Ciudad } from './ciudad.entity.js';
import { ProductoAlmacen } from './producto-almacen.entity.js';

@Entity('almacenes')
export class Almacen {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 100, unique: true })
  nombre: string;

  @Column({ name: 'ubicacion', type: 'varchar', length: 255, nullable: true })
  ubicacion: string | null;

  @Column({ name: 'ciudad_id', type: 'int' })
  ciudad_id: number;

  @ManyToOne(() => Ciudad)
  @JoinColumn({ name: 'ciudad_id' })
  ciudad?: Relation<Ciudad> | null;

  @OneToMany(() => ProductoAlmacen, (stock) => stock.almacen)
  productos_almacen?: Relation<ProductoAlmacen>[];
}
