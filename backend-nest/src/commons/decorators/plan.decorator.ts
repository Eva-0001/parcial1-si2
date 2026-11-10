import { SetMetadata } from '@nestjs/common';
import type { FuncionDePlan } from '../../entities/plan.entity.js';

export const FUNCION_DE_PLAN = 'funcion_de_plan';
export const SIN_VERIFICAR_SUSCRIPCION = 'sin_verificar_suscripcion';

/** La ruta solo funciona si el plan de la empresa incluye esta funcion. */
export const RequiereFuncion = (funcion: FuncionDePlan) =>
  SetMetadata(FUNCION_DE_PLAN, funcion);

/**
 * La ruta sigue disponible aunque la suscripcion este vencida o la empresa
 * suspendida (ver el plan, renovarlo, cerrar sesion).
 */
export const SinVerificarSuscripcion = () =>
  SetMetadata(SIN_VERIFICAR_SUSCRIPCION, true);
