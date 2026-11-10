import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Rol } from '../commons/enums/rol.enum.js';
import { CodigoError, errorDeNegocio } from '../commons/errores.js';
import { hashearPassword } from '../commons/passwords.js';
import { comoPlataforma, enEmpresa } from '../commons/tenant/contexto-tenant.js';
import type {
  ActualizarEmpresaDto,
  ActualizarPlanDto,
  CambiarPlanDto,
  CrearPlanDto,
  RegistrarEmpresaDto,
} from '../dto/empresa.dto.js';
import { type Empresa, EstadoEmpresa } from '../entities/empresa.entity.js';
import type { FuncionDePlan, Plan } from '../entities/plan.entity.js';
import { Usuario } from '../entities/usuario.entity.js';
import { EmpresasRepository } from '../repositories/empresas.repository.js';
import { UsuariosRepository } from '../repositories/usuarios.repository.js';
import { AuthService, type RespuestaDeToken } from './auth.service.js';

/** Lo que el resto del backend necesita saber de la suscripcion de una empresa. */
export interface EstadoDeSuscripcion {
  empresa: { id: number; nombre: string; slug: string; estado: string };
  plan: Plan | null;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
  dias_restantes: number | null;
  /** activa | vencida | sin_suscripcion | empresa_suspendida */
  estado: 'activa' | 'vencida' | 'sin_suscripcion' | 'empresa_suspendida';
}

/** Datos con los que nace cada empresa nueva (se pueden editar despues). */
const CATALOGOS_INICIALES = {
  talla: ['XS', 'S', 'M', 'L', 'XL'],
  colores: ['Negro', 'Blanco', 'Azul', 'Rojo', 'Gris', 'Beige'],
  categorias: ['Poleras', 'Camisas', 'Pantalones', 'Vestidos', 'Chaquetas', 'Accesorios'],
  temporadas: ['Primavera', 'Verano', 'Otono', 'Invierno'],
} as const;

const DURACION_CACHE_MS = 15_000;

@Injectable()
export class EmpresasService {
  /** Cache corta: el guard de suscripcion consulta esto en cada peticion. */
  private readonly cache = new Map<number, { hasta: number; valor: EstadoDeSuscripcion }>();
  private readonly cacheSlugs = new Map<string, { hasta: number; id: number | null }>();

  constructor(
    private readonly repo: EmpresasRepository,
    private readonly usuarios: UsuariosRepository,
    private readonly auth: AuthService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------ consultas

  /** Id de la empresa con ese slug (null si no existe). Cacheado. */
  async idPorSlug(slug: string): Promise<number | null> {
    const clave = slug.trim().toLowerCase();
    const enCache = this.cacheSlugs.get(clave);
    if (enCache && enCache.hasta > Date.now()) return enCache.id;

    const empresa = await this.repo.porSlug(clave);
    const id = empresa?.id ?? null;
    this.cacheSlugs.set(clave, { hasta: Date.now() + DURACION_CACHE_MS, id });
    return id;
  }

  async estadoDe(empresaId: number): Promise<EstadoDeSuscripcion> {
    const enCache = this.cache.get(empresaId);
    if (enCache && enCache.hasta > Date.now()) return enCache.valor;

    const fila = await this.repo.vigente(empresaId);
    if (!fila) {
      throw errorDeNegocio(NotFoundException, CodigoError.EMPRESA_INEXISTENTE, 'La empresa no existe');
    }
    const plan = fila.plan_id ? await this.repo.planPorId(fila.plan_id) : null;

    let estado: EstadoDeSuscripcion['estado'] = 'activa';
    if (fila.empresa_estado !== EstadoEmpresa.ACTIVA) estado = 'empresa_suspendida';
    else if (!fila.suscripcion_id || !plan) estado = 'sin_suscripcion';
    else if ((fila.dias_restantes ?? -1) < 0) estado = 'vencida';

    const valor: EstadoDeSuscripcion = {
      empresa: {
        id: fila.empresa_id,
        nombre: fila.empresa_nombre,
        slug: fila.empresa_slug,
        estado: fila.empresa_estado,
      },
      plan,
      fecha_inicio: fila.fecha_inicio,
      fecha_vencimiento: fila.fecha_vencimiento,
      dias_restantes: fila.dias_restantes,
      estado,
    };
    this.cache.set(empresaId, { hasta: Date.now() + DURACION_CACHE_MS, valor });
    return valor;
  }

  /** Datos publicos para que la tienda muestre su nombre antes del login. */
  async publica(slug: string) {
    const empresa = await this.repo.porSlug(slug.trim().toLowerCase());
    if (!empresa || empresa.estado !== EstadoEmpresa.ACTIVA) {
      throw errorDeNegocio(NotFoundException, CodigoError.EMPRESA_INEXISTENTE, 'Tienda no encontrada');
    }
    return { id: empresa.id, nombre: empresa.nombre, slug: empresa.slug };
  }

  /** "Mi empresa": plan, vencimiento, limites y cuanto usa de cada uno. */
  async resumen(empresaId: number) {
    const [estado, uso, empresa] = await Promise.all([
      this.estadoDe(empresaId),
      this.repo.uso(empresaId),
      this.repo.porId(empresaId),
    ]);
    return { ...estado, empresa, uso };
  }

  historial(empresaId: number) {
    return this.repo.historial(empresaId);
  }

  listarPlanes(soloActivos = true): Promise<Plan[]> {
    return this.repo.listarPlanes(soloActivos);
  }

  // ------------------------------------------------- reglas del plan

  async verificarFuncion(empresaId: number, funcion: FuncionDePlan): Promise<void> {
    const { plan } = await this.estadoDe(empresaId);
    if (!plan?.[funcion]) {
      throw errorDeNegocio(
        ForbiddenException,
        CodigoError.FUNCION_NO_INCLUIDA,
        `Tu plan${plan ? ` ${plan.nombre}` : ''} no incluye esta funcion. ` +
          'Cambia a un plan que la incluya para usarla.',
      );
    }
  }

  /** Antes de crear una sucursal: no pasar el limite del plan. */
  async verificarCupoDeSucursales(empresaId: number): Promise<void> {
    const [{ plan }, uso] = await Promise.all([
      this.estadoDe(empresaId),
      this.repo.uso(empresaId),
    ]);
    const maximo = plan?.max_sucursales ?? 0;
    if (uso.sucursales >= maximo) {
      throw errorDeNegocio(
        ForbiddenException,
        CodigoError.LIMITE_DEL_PLAN,
        `Tu plan ${plan?.nombre ?? ''} permite hasta ${maximo} sucursales y ya tenes ${uso.sucursales}. ` +
          'Cambia de plan para agregar mas.',
      );
    }
  }

  // ----------------------------------------------------- alta de empresa

  /**
   * Crea el espacio de trabajo de una empresa en una sola transaccion: la
   * empresa, su suscripcion, sus roles, su administrador, catalogos base y una
   * primera sucursal. Devuelve la sesion del administrador ya iniciada.
   */
  async registrar(datos: RegistrarEmpresaDto): Promise<RespuestaDeToken & { empresa: Empresa }> {
    const slug = datos.slug.trim().toLowerCase();
    const plan = await this.planActivo(datos.plan);

    if (await this.repo.porSlug(slug)) {
      throw new ConflictException(`El identificador "${slug}" ya esta en uso`);
    }
    const admin = datos.administrador;
    if (await this.usuarios.usernameOcupado(admin.username)) {
      throw new ConflictException('El nombre de usuario ya esta en uso');
    }
    if (await this.usuarios.correoOcupado(admin.correo)) {
      throw new ConflictException('El correo ya esta registrado');
    }
    const password = await hashearPassword(admin.password);

    const { empresa, adminId } = await comoPlataforma(() =>
      this.dataSource.transaction(async (m) => {
        const [empresa] = await m.query<Empresa[]>(
          `INSERT INTO empresas (nombre, slug, nit, correo, telefono)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [datos.nombre.trim(), slug, datos.nit ?? null, datos.correo ?? admin.correo, datos.telefono ?? null],
        );

        // De aca en adelante la transaccion trabaja "dentro" de la empresa
        // nueva: cada INSERT toma su empresa_id por defecto y RLS lo valida.
        await m.query(
          `SELECT set_config('app.empresa_id', $1, true), set_config('app.plataforma', 'off', true)`,
          [String(empresa.id)],
        );

        await this.repo.abrirSuscripcion(m, empresa.id, plan.id, 1, 'Alta de la empresa');

        for (const rol of Object.values(Rol)) {
          await m.query(`INSERT INTO roles (nombre) VALUES ($1)`, [rol]);
        }
        const [{ id: rolAdmin }] = await m.query<{ id: number }[]>(
          `SELECT id FROM roles WHERE nombre = $1`,
          [Rol.ADMINISTRADOR],
        );

        const [{ id: adminId }] = await m.query<{ id: number }[]>(
          `INSERT INTO usuarios (nombre, apellido, correo, username, password, genero, rol_id, tipo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'usuario') RETURNING id`,
          [admin.nombre, admin.apellido, admin.correo, admin.username, password, admin.genero ?? null, rolAdmin],
        );

        for (const [tabla, nombres] of Object.entries(CATALOGOS_INICIALES)) {
          for (const nombre of nombres) {
            await m.query(`INSERT INTO ${tabla} (nombre) VALUES ($1)`, [nombre]);
          }
        }

        const [{ id: ciudadId }] = await m.query<{ id: number }[]>(
          `INSERT INTO ciudades (nombre) VALUES ($1) RETURNING id`,
          [datos.ciudad?.trim() || 'Santa Cruz'],
        );
        await m.query(`INSERT INTO sucursales (nombre, ciudad_id) VALUES ($1, $2)`, [
          datos.sucursal?.trim() || 'Casa matriz',
          ciudadId,
        ]);

        return { empresa, adminId };
      }),
    );

    this.cacheSlugs.delete(slug);
    const sesion = await enEmpresa(empresa.id, async () => {
      const usuario = await this.dataSource
        .getRepository(Usuario)
        .findOneOrFail({ where: { id: adminId }, relations: { rol: true } });
      return this.auth.armarToken(usuario);
    });
    return { ...sesion, empresa };
  }

  async actualizarDatos(empresaId: number, datos: ActualizarEmpresaDto): Promise<Empresa> {
    const empresa = await this.repo.porId(empresaId);
    if (!empresa) throw new NotFoundException('La empresa no existe');
    Object.assign(empresa, datos);
    const guardada = await this.repo.guardarEmpresa(empresa);
    this.olvidar(empresaId);
    return guardada;
  }

  // ------------------------------------------------------ suscripciones

  /** Cambio de plan (pago simulado): abre un periodo nuevo desde hoy. */
  async cambiarPlan(empresaId: number, datos: CambiarPlanDto, quien: string) {
    const plan = await this.planActivo(datos.plan);
    const uso = await this.repo.uso(empresaId);
    if (uso.sucursales > plan.max_sucursales) {
      throw errorDeNegocio(
        ConflictException,
        CodigoError.LIMITE_DEL_PLAN,
        `El plan ${plan.nombre} permite ${plan.max_sucursales} sucursales y la empresa tiene ${uso.sucursales}. ` +
          'Elimina sucursales antes de bajar de plan.',
      );
    }
    await this.repo.reemplazarSuscripcion(
      empresaId,
      plan.id,
      datos.meses ?? 1,
      `Cambio al plan ${plan.nombre} (${quien})`,
      false,
    );
    this.olvidar(empresaId);
    return this.resumen(empresaId);
  }

  /** Renovacion (pago simulado) del mismo plan, sumando al vencimiento actual. */
  async renovar(empresaId: number, meses: number, quien: string) {
    const actual = await this.estadoDe(empresaId);
    if (!actual.plan) {
      throw new BadRequestException('La empresa no tiene un plan para renovar; asignale uno');
    }
    await this.repo.reemplazarSuscripcion(
      empresaId,
      actual.plan.id,
      meses,
      `Renovacion por ${meses} mes(es) (${quien})`,
      true,
    );
    this.olvidar(empresaId);
    return this.resumen(empresaId);
  }

  // ----------------------------------------------- superadmin / plataforma

  resumenPlataforma() {
    return this.repo.resumenEmpresas();
  }

  async cambiarEstado(empresaId: number, estado: EstadoEmpresa): Promise<Empresa> {
    const empresa = await this.repo.porId(empresaId);
    if (!empresa) throw new NotFoundException('La empresa no existe');
    empresa.estado = estado;
    const guardada = await this.repo.guardarEmpresa(empresa);
    this.olvidar(empresaId);
    this.cacheSlugs.clear();
    return guardada;
  }

  async crearPlan(datos: CrearPlanDto): Promise<Plan> {
    if (await this.repo.planPorCodigo(datos.codigo)) {
      throw new ConflictException('Ya existe un plan con ese codigo');
    }
    return this.repo.guardarPlan(
      this.repo.crearPlan({ ...datos, precio_mensual: String(datos.precio_mensual) }),
    );
  }

  async actualizarPlan(id: number, datos: ActualizarPlanDto): Promise<Plan> {
    const plan = await this.repo.planPorId(id);
    if (!plan) throw new NotFoundException('El plan no existe');
    const { precio_mensual, ...resto } = datos;
    Object.assign(plan, resto);
    if (precio_mensual !== undefined) plan.precio_mensual = String(precio_mensual);
    const guardado = await this.repo.guardarPlan(plan);
    this.cache.clear();
    return guardado;
  }

  // ------------------------------------------------------------ privados

  private async planActivo(codigo: string): Promise<Plan> {
    const plan = await this.repo.planPorCodigo(codigo.trim().toLowerCase());
    if (!plan || !plan.activo) {
      throw new BadRequestException(`El plan "${codigo}" no existe o no esta disponible`);
    }
    return plan;
  }

  private olvidar(empresaId: number): void {
    this.cache.delete(empresaId);
  }
}
