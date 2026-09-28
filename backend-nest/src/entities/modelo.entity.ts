import { Transform } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { aIsoSinZona } from '../commons/fechas.js';
import { Categoria } from './categoria.entity.js';
import { Coleccion } from './coleccion.entity.js';
import { Producto } from './producto.entity.js';
import { Proveedor } from './proveedor.entity.js';
import { Temporada } from './temporada.entity.js';

/**
 * Producto base (el "diseño"): lo que el cliente ve como una prenda. Sus variantes
 * (talla x color) son los `productos`, que es lo que tiene stock y se vende.
 * Los datos comunes se copian a cada variante al guardar el modelo.
 */
@Entity('modelos')
export class Modelo {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 150 })
  nombre: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string | null;

  /** Precio de lista con el que nacen las variantes nuevas. */
  @Column({ name: 'precio', type: 'numeric', precision: 10, scale: 2 })
  precio: string;

  @Column({
    name: 'precio_mayor',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  precio_mayor: string | null;

  @Column({ name: 'minimo_mayor', type: 'int', default: 6 })
  minimo_mayor: number;

  @Column({ name: 'categoria_id', type: 'int', nullable: true })
  categoria_id: number | null;

  @Column({ name: 'coleccion_id', type: 'int', nullable: true })
  coleccion_id: number | null;

  @Column({ name: 'temporada_id', type: 'int', nullable: true })
  temporada_id: number | null;

  @Column({ name: 'proveedor_id', type: 'int', nullable: true })
  proveedor_id: number | null;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @CreateDateColumn({ name: 'creado_en', type: 'timestamp' })
  creado_en: Date;

  @ManyToOne(() => Categoria)
  @JoinColumn({ name: 'categoria_id' })
  categoria?: Relation<Categoria> | null;

  @ManyToOne(() => Coleccion)
  @JoinColumn({ name: 'coleccion_id' })
  coleccion?: Relation<Coleccion> | null;

  @ManyToOne(() => Temporada)
  @JoinColumn({ name: 'temporada_id' })
  temporada?: Relation<Temporada> | null;

  @ManyToOne(() => Proveedor)
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Relation<Proveedor> | null;

  @OneToMany(() => Producto, (producto) => producto.modelo)
  variantes?: Relation<Producto>[];
}
