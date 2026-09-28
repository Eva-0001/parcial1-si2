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
import { TipoMovimientoAlmacen } from '../commons/enums/almacen.enum.js';
import { aIsoSinZona } from '../commons/fechas.js';
import { Almacen } from './almacen.entity.js';
import { DetalleMovimientoAlmacen } from './detalle-movimiento-almacen.entity.js';
import { Sucursal } from './sucursal.entity.js';
import { Usuario } from './usuario.entity.js';

@Entity('movimientos_almacen')
export class MovimientoAlmacen {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({
    name: 'tipo',
    type: 'enum',
    enum: TipoMovimientoAlmacen,
    enumName: 'tipo_movimiento_almacen_enum',
  })
  tipo: TipoMovimientoAlmacen;

  @Index('ix_movimientos_almacen_almacen')
  @Column({ name: 'almacen_id', type: 'int' })
  almacen_id: number;

  /** Sucursal de destino (envio) u origen (devolucion). Nula en un ingreso. */
  @Column({ name: 'sucursal_id', type: 'int', nullable: true })
  sucursal_id: number | null;

  @Column({ name: 'usuario_id', type: 'int' })
  usuario_id: number;

  @Column({ name: 'observacion', type: 'text', nullable: true })
  observacion: string | null;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @CreateDateColumn({ name: 'creado_en', type: 'timestamp' })
  creado_en: Date;

  @ManyToOne(() => Almacen)
  @JoinColumn({ name: 'almacen_id' })
  almacen?: Relation<Almacen> | null;

  @ManyToOne(() => Sucursal)
  @JoinColumn({ name: 'sucursal_id' })
  sucursal?: Relation<Sucursal> | null;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Relation<Usuario> | null;

  @OneToMany(() => DetalleMovimientoAlmacen, (detalle) => detalle.movimiento, {
    cascade: true,
  })
  detalles?: Relation<DetalleMovimientoAlmacen>[];
}
