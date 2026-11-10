import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto multiempresa de la peticion en curso.
 *
 * El aislamiento real lo hace PostgreSQL con Row Level Security: cada vez que
 * TypeORM toma una conexion del pool, `instalarAislamientoPorEmpresa` copia este
 * contexto a variables de sesion (`app.empresa_id`, `app.plataforma`) y las
 * politicas RLS filtran todas las tablas por esa empresa. Asi ninguna consulta
 * (QueryBuilder, find, SQL crudo o el SQL que arma la IA) puede ver ni escribir
 * filas de otra empresa, aunque el codigo se olvide de filtrar.
 *
 * El objeto es mutable a proposito: el middleware lo crea vacio al empezar la
 * peticion y el guard JWT lo completa cuando conoce al usuario.
 */
export interface ContextoTenant {
  /** Empresa (tenant) cuyos datos se pueden ver. null = ninguna. */
  empresaId: number | null;
  /** Modo plataforma: el superadmin o un proceso interno ve todas las empresas. */
  plataforma: boolean;
}

const almacen = new AsyncLocalStorage<ContextoTenant>();

const SIN_CONTEXTO: ContextoTenant = Object.freeze({
  empresaId: null,
  plataforma: false,
});

export function contextoActual(): ContextoTenant {
  return almacen.getStore() ?? SIN_CONTEXTO;
}

/** Ejecuta `fn` con un contexto nuevo (lo usa el middleware por peticion). */
export function ejecutarConContexto<T>(
  contexto: ContextoTenant,
  fn: () => T,
): T {
  return almacen.run(contexto, fn);
}

/** Ejecuta `fn` viendo los datos de todas las empresas (procesos de plataforma). */
export function comoPlataforma<T>(fn: () => Promise<T>): Promise<T> {
  return almacen.run({ empresaId: null, plataforma: true }, fn);
}

/** Ejecuta `fn` dentro de una empresa concreta (alta de empresa, seed). */
export function enEmpresa<T>(empresaId: number, fn: () => Promise<T>): Promise<T> {
  return almacen.run({ empresaId, plataforma: false }, fn);
}

/** Id de la empresa actual; lanza si no hay ninguna (error de programacion). */
export function empresaActualId(): number {
  const { empresaId } = contextoActual();
  if (empresaId === null) {
    throw new Error('No hay una empresa en el contexto de la peticion');
  }
  return empresaId;
}
