import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { MovimientoAlmacen } from './movimiento-almacen.entity.js';
import { Producto } from './producto.entity.js';

@Entity('detalle_movimiento_almacen')
export class DetalleMovimientoAlmacen {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Index('ix_detalle_movimiento_almacen_movimiento')
  @Column({ name: 'movimiento_id', type: 'int' })
  movimiento_id: number;

  @Column({ name: 'producto_id', type: 'int' })
  producto_id: number;

  @Column({ name: 'cantidad', type: 'int' })
  cantidad: number;

  @ManyToOne(() => MovimientoAlmacen, (movimiento) => movimiento.detalles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'movimiento_id' })
  movimiento?: Relation<MovimientoAlmacen> | null;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto?: Relation<Producto> | null;
}
