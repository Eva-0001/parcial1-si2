import type { HttpException } from '@nestjs/common';

export const CodigoError = {
  SIN_STOCK: 'SIN_STOCK',
  STOCK_INEXISTENTE: 'STOCK_INEXISTENTE',
  FECHA_INVALIDA: 'FECHA_INVALIDA',
  SUCURSALES_MEZCLADAS: 'SUCURSALES_MEZCLADAS',
  USUARIO_INEXISTENTE: 'USUARIO_INEXISTENTE',
  SESION_INVALIDA: 'SESION_INVALIDA',
  EMPRESA_REQUERIDA: 'EMPRESA_REQUERIDA',
  EMPRESA_INEXISTENTE: 'EMPRESA_INEXISTENTE',
  EMPRESA_SUSPENDIDA: 'EMPRESA_SUSPENDIDA',
  SUSCRIPCION_VENCIDA: 'SUSCRIPCION_VENCIDA',
  FUNCION_NO_INCLUIDA: 'FUNCION_NO_INCLUIDA',
  LIMITE_DEL_PLAN: 'LIMITE_DEL_PLAN',
  SOLO_PLATAFORMA: 'SOLO_PLATAFORMA',
  FUERA_DE_PLAZO: 'FUERA_DE_PLAZO',
  PRECIO_CAMBIADO: 'PRECIO_CAMBIADO',
  TOTAL_INCONSISTENTE: 'TOTAL_INCONSISTENTE',
} as const;

export type CodigoError = (typeof CodigoError)[keyof typeof CodigoError];

type ConstructorDeExcepcion = new (cuerpo: object) => HttpException;

// Error de negocio: el cliente lo reconoce por `codigo`, sin depender del texto.
export function errorDeNegocio(
  Excepcion: ConstructorDeExcepcion,
  codigo: CodigoError,
  mensaje: string,
): HttpException {
  return new Excepcion({ detail: mensaje, codigo });
}
