import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { comoPlataforma } from '../commons/tenant/contexto-tenant.js';
import { Empresa } from '../entities/empresa.entity.js';
import { Plan } from '../entities/plan.entity.js';
import { EstadoSuscripcion, Suscripcion } from '../entities/suscripcion.entity.js';

/** Foto de la suscripcion vigente de una empresa, con su plan. */
export interface FilaSuscripcion {
  empresa_id: number;
  empresa_nombre: string;
  empresa_slug: string;
  empresa_estado: string;
  suscripcion_id: number | null;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
  dias_restantes: number | null;
  plan_id: number | null;
}

export interface UsoDeEmpresa {
  sucursales: number;
  usuarios: number;
  productos: number;
}

/**
 * Acceso a empresas, planes y suscripciones. Todo corre en modo plataforma:
 * estas consultas las usan el middleware y los guards antes (o por encima) del
 * contexto de una empresa, y los permisos ya los validaron los guards.
 */
@Injectable()
export class EmpresasRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get empresas() {
    return this.dataSource.getRepository(Empresa);
  }

  private get planes() {
    return this.dataSource.getRepository(Plan);
  }

  private get suscripciones() {
    return this.dataSource.getRepository(Suscripcion);
  }

  porSlug(slug: string): Promise<Empresa | null> {
    return comoPlataforma(() => this.empresas.findOne({ where: { slug } }));
  }

  porId(id: number): Promise<Empresa | null> {
    return comoPlataforma(() => this.empresas.findOne({ where: { id } }));
  }

  listar(): Promise<Empresa[]> {
    return comoPlataforma(() => this.empresas.find({ order: { id: 'ASC' } }));
  }

  async guardarEmpresa(empresa: Empresa): Promise<Empresa> {
    return comoPlataforma(() => this.empresas.save(empresa));
  }

  /** Suscripcion vigente (estado activa) con dias que le quedan. */
  async vigente(empresaId: number): Promise<FilaSuscripcion | null> {
    const filas = await comoPlataforma(() =>
      this.dataSource.query<FilaSuscripcion[]>(
        `SELECT e.id AS empresa_id, e.nombre AS empresa_nombre,
                e.slug AS empresa_slug, e.estado AS empresa_estado,
                s.id AS suscripcion_id,
                s.fecha_inicio::text AS fecha_inicio,
                s.fecha_vencimiento::text AS fecha_vencimiento,
                (s.fecha_vencimiento - current_date)::int AS dias_restantes,
                s.plan_id
           FROM empresas e
           LEFT JOIN suscripciones s
             ON s.empresa_id = e.id AND s.estado = 'activa'
          WHERE e.id = $1`,
        [empresaId],
      ),
    );
    return filas[0] ?? null;
  }

  historial(empresaId: number): Promise<Suscripcion[]> {
    return comoPlataforma(() =>
      this.suscripciones.find({
        where: { empresa_id: empresaId },
        relations: { plan: true },
        order: { id: 'DESC' },
      }),
    );
  }

  async uso(empresaId: number): Promise<UsoDeEmpresa> {
    const [fila] = await comoPlataforma(() =>
      this.dataSource.query<UsoDeEmpresa[]>(
        `SELECT (SELECT count(*) FROM sucursales WHERE empresa_id = $1)::int AS sucursales,
                (SELECT count(*) FROM usuarios WHERE empresa_id = $1)::int AS usuarios,
                (SELECT count(*) FROM productos WHERE empresa_id = $1)::int AS productos`,
        [empresaId],
      ),
    );
    return fila;
  }

  // -------------------------------------------------------------- planes

  listarPlanes(soloActivos: boolean): Promise<Plan[]> {
    return this.planes.find({
      where: soloActivos ? { activo: true } : {},
      order: { precio_mensual: 'ASC' },
    });
  }

  planPorId(id: number): Promise<Plan | null> {
    return this.planes.findOne({ where: { id } });
  }

  planPorCodigo(codigo: string): Promise<Plan | null> {
    return this.planes.findOne({ where: { codigo } });
  }

  guardarPlan(plan: Plan): Promise<Plan> {
    return comoPlataforma(() => this.planes.save(plan));
  }

  crearPlan(datos: Partial<Plan>): Plan {
    return this.planes.create(datos);
  }

  // -------------------------------------------------------- suscripciones

  /**
   * Cierra la suscripcion vigente y abre otra. `desdeVencimiento` extiende a
   * partir del vencimiento actual (renovacion anticipada) en vez de hoy.
   */
  async reemplazarSuscripcion(
    empresaId: number,
    planId: number,
    meses: number,
    observacion: string,
    desdeVencimiento: boolean,
  ): Promise<void> {
    await comoPlataforma(() =>
      this.dataSource.transaction(async (m) => {
        const [actual] = await m.query<{ fecha_vencimiento: string }[]>(
          `SELECT fecha_vencimiento::text AS fecha_vencimiento
             FROM suscripciones
            WHERE empresa_id = $1 AND estado = 'activa'
            FOR UPDATE`,
          [empresaId],
        );
        await m.query(
          `UPDATE suscripciones SET estado = $2
            WHERE empresa_id = $1 AND estado = 'activa'`,
          [empresaId, EstadoSuscripcion.REEMPLAZADA],
        );
        await this.abrirSuscripcion(
          m,
          empresaId,
          planId,
          meses,
          observacion,
          desdeVencimiento ? (actual?.fecha_vencimiento ?? null) : null,
        );
      }),
    );
  }

  /** Inserta la suscripcion vigente. Usable dentro de otra transaccion. */
  async abrirSuscripcion(
    m: EntityManager,
    empresaId: number,
    planId: number,
    meses: number,
    observacion: string,
    vencimientoPrevio: string | null = null,
  ): Promise<void> {
    await m.query(
      `INSERT INTO suscripciones
         (empresa_id, plan_id, fecha_inicio, fecha_vencimiento, estado, observacion)
       VALUES ($1, $2, current_date,
               GREATEST(current_date, coalesce($5::date, current_date))
                 + make_interval(months => $3),
               'activa', $4)`,
      [empresaId, planId, meses, observacion, vencimientoPrevio],
    );
  }

  /** Resumen de la plataforma para el superadmin. */
  async resumenEmpresas(): Promise<Record<string, unknown>[]> {
    return comoPlataforma(() =>
      this.dataSource.query(
        `SELECT e.id, e.nombre, e.slug, e.nit, e.correo, e.telefono, e.estado,
                e.creada_en,
                p.codigo AS plan_codigo, p.nombre AS plan_nombre,
                p.max_sucursales,
                s.fecha_inicio::text AS fecha_inicio,
                s.fecha_vencimiento::text AS fecha_vencimiento,
                (s.fecha_vencimiento - current_date)::int AS dias_restantes,
                (SELECT count(*) FROM sucursales x WHERE x.empresa_id = e.id)::int AS sucursales,
                (SELECT count(*) FROM usuarios x WHERE x.empresa_id = e.id)::int AS usuarios,
                (SELECT count(*) FROM productos x WHERE x.empresa_id = e.id)::int AS productos,
                (SELECT count(*) FROM ventas x WHERE x.empresa_id = e.id)::int AS ventas
           FROM empresas e
           LEFT JOIN suscripciones s ON s.empresa_id = e.id AND s.estado = 'activa'
           LEFT JOIN planes p ON p.id = s.plan_id
          ORDER BY e.id`,
      ),
    );
  }
}
