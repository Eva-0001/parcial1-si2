import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Almacen } from './almacen.entity.js';
import { Producto } from './producto.entity.js';

@Entity('producto_almacen')
@Unique('uq_producto_almacen', ['producto_id', 'almacen_id'])
@Check('ck_producto_almacen_cantidad', '"cantidad" >= 0')
export class ProductoAlmacen {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'cantidad', type: 'int', default: 0 })
  cantidad: number;

  @Column({ name: 'producto_id', type: 'int' })
  producto_id: number;

  @Index('ix_producto_almacen_almacen')
  @Column({ name: 'almacen_id', type: 'int' })
  almacen_id: number;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto?: Relation<Producto> | null;

  @ManyToOne(() => Almacen, (almacen) => almacen.productos_almacen, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'almacen_id' })
  almacen?: Relation<Almacen> | null;
}
