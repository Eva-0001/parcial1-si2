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
import { EstadoEnvio } from '../commons/enums/envio.enum.js';
import { aIsoSinZona } from '../commons/fechas.js';
import { Envio } from './envio.entity.js';
import { Usuario } from './usuario.entity.js';

/** Historial de estados del envio: es lo que ve el cliente como seguimiento. */
@Entity('envio_eventos')
export class EventoEnvio {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Index('ix_envio_eventos_envio')
  @Column({ name: 'envio_id', type: 'int' })
  envio_id: number;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoEnvio,
    enumName: 'estado_envio_enum',
  })
  estado: EstadoEnvio;

  @Column({ name: 'nota', type: 'varchar', length: 255, nullable: true })
  nota: string | null;

  @Column({ name: 'usuario_id', type: 'int', nullable: true })
  usuario_id: number | null;

  @Transform(({ value }) => aIsoSinZona(value), { toPlainOnly: true })
  @CreateDateColumn({ name: 'creado_en', type: 'timestamp' })
  creado_en: Date;

  @ManyToOne(() => Envio, (envio) => envio.eventos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envio_id' })
  envio?: Relation<Envio> | null;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Relation<Usuario> | null;
}
