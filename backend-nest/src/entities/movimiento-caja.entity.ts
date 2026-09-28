import { Transform } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { TipoMovimientoCaja } from '../commons/enums/caja.enum.js';
import { aIsoSinZona } from '../commons/fechas.js';
import { TurnoCaja } from './turno-caja.entity.js';
import { Usuario } from './usuario.entity.js';

@Entity('movimientos_caja')
export class MovimientoCaja {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Index('ix_movimientos_caja_turno')
  @Column({ name: 'turno_id', type: 'int' })
  turno_id: number;

  @Column({
    name: 'tipo',
    type: 'enum',
    enum: TipoMovimientoCaja,
    enumName: 'tipo_movimiento_caja_enum',
  })
  tipo: TipoMovimientoCaja;

  @Column({ name: 'monto', type: 'numeric', precision: 10, scale: 2 })
  monto: string;

  @Column({ name: 'motivo', type: 'varchar', length: 255 })
  motivo: string;

  @Column({ name: 'usuario_id', type: 'int' })
  usuario_id: number;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @CreateDateColumn({ name: 'creado_en', type: 'timestamp' })
  creado_en: Date;

  @ManyToOne(() => TurnoCaja, (turno) => turno.movimientos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'turno_id' })
  turno?: Relation<TurnoCaja> | null;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Relation<Usuario> | null;
}
