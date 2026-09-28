import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Categoria } from './categoria.entity.js';
import { Coleccion } from './coleccion.entity.js';
import { Color } from './color.entity.js';
import { Modelo } from './modelo.entity.js';
import { ProductoSucursal } from './producto-sucursal.entity.js';
import { Proveedor } from './proveedor.entity.js';
import { Talla } from './talla.entity.js';
import { Temporada } from './temporada.entity.js';

/** Variante vendible de un modelo: una talla en un color. Es lo que tiene stock. */
@Entity('productos')
@Index('ux_productos_variante', ['modelo_id', 'color_id', 'talla_id'], {
  unique: true,
})
export class Producto {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Index('ix_productos_modelo')
  @Column({ name: 'modelo_id', type: 'int' })
  modelo_id: number;

  /** Codigo de la variante (etiqueta / codigo de barras del POS). */
  @Index('ux_productos_sku', { unique: true })
  @Column({ name: 'sku', type: 'varchar', length: 60 })
  sku: string;

  @Column({ name: 'nombre', type: 'varchar', length: 150 })
  nombre: string;

  @Column({ name: 'foto', type: 'varchar', length: 255, nullable: true })
  foto: string | null;

  @Column({ name: 'precio', type: 'numeric', precision: 10, scale: 2 })
  precio: string;

  /** Precio por mayor; nulo si el producto solo se vende por menor. */
  @Column({
    name: 'precio_mayor',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  precio_mayor: string | null;

  /** Unidades surtidas (entre prendas con precio por mayor) para acceder a ese precio. */
  @Column({ name: 'minimo_mayor', type: 'int', default: 6 })
  minimo_mayor: number;

  @Column({ name: 'categoria_id', type: 'int', nullable: true })
  categoria_id: number | null;

  @Column({ name: 'coleccion_id', type: 'int', nullable: true })
  coleccion_id: number | null;

  @Column({ name: 'color_id', type: 'int', nullable: true })
  color_id: number | null;

  @Column({ name: 'talla_id', type: 'int', nullable: true })
  talla_id: number | null;

  @Column({ name: 'temporada_id', type: 'int', nullable: true })
  temporada_id: number | null;

  @Column({ name: 'proveedor_id', type: 'int', nullable: true })
  proveedor_id: number | null;

  @ManyToOne(() => Modelo, (modelo) => modelo.variantes, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'modelo_id' })
  modelo?: Relation<Modelo> | null;

  @ManyToOne(() => Categoria, (categoria) => categoria.productos)
  @JoinColumn({ name: 'categoria_id' })
  categoria?: Relation<Categoria> | null;

  @ManyToOne(() => Coleccion, (coleccion) => coleccion.productos)
  @JoinColumn({ name: 'coleccion_id' })
  coleccion?: Relation<Coleccion> | null;

  @ManyToOne(() => Color, (color) => color.productos)
  @JoinColumn({ name: 'color_id' })
  color?: Relation<Color> | null;

  @ManyToOne(() => Talla, (talla) => talla.productos)
  @JoinColumn({ name: 'talla_id' })
  talla?: Relation<Talla> | null;

  @ManyToOne(() => Temporada, (temporada) => temporada.productos)
  @JoinColumn({ name: 'temporada_id' })
  temporada?: Relation<Temporada> | null;

  @ManyToOne(() => Proveedor, (proveedor) => proveedor.productos)
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Relation<Proveedor> | null;

  @OneToMany(() => ProductoSucursal, (stock) => stock.producto)
  productos_sucursal?: Relation<ProductoSucursal>[];
}
