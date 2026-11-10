import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Funciones que un plan puede habilitar o no. */
export const FUNCIONES_DE_PLAN = [
  'gestion_productos',
  'gestion_ventas',
  'reservas',
  'operacion_offline',
  'reportes_convencionales',
  'reportes_ia',
] as const;

export type FuncionDePlan = (typeof FUNCIONES_DE_PLAN)[number];

/** Plan de suscripcion. Los limites se configuran desde el backend (superadmin). */
@Entity('planes')
export class Plan {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'codigo', type: 'varchar', length: 30, unique: true })
  codigo: string;

  @Column({ name: 'nombre', type: 'varchar', length: 60 })
  nombre: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 255, nullable: true })
  descripcion: string | null;

  @Column({ name: 'precio_mensual', type: 'numeric', precision: 10, scale: 2, default: 0 })
  precio_mensual: string;

  @Column({ name: 'max_sucursales', type: 'int' })
  max_sucursales: number;

  @Column({ name: 'gestion_productos', type: 'boolean', default: true })
  gestion_productos: boolean;

  @Column({ name: 'gestion_ventas', type: 'boolean', default: true })
  gestion_ventas: boolean;

  @Column({ name: 'reservas', type: 'boolean', default: true })
  reservas: boolean;

  @Column({ name: 'operacion_offline', type: 'boolean', default: true })
  operacion_offline: boolean;

  @Column({ name: 'reportes_convencionales', type: 'boolean', default: true })
  reportes_convencionales: boolean;

  @Column({ name: 'reportes_ia', type: 'boolean', default: false })
  reportes_ia: boolean;

  @Column({ name: 'activo', type: 'boolean', default: true })
  activo: boolean;
}
