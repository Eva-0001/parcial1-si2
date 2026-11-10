import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { FuncionDePlan } from '../../entities/plan.entity.js';
import { EmpresasService } from '../../services/empresas.service.js';
import {
  FUNCION_DE_PLAN,
  SIN_VERIFICAR_SUSCRIPCION,
} from '../decorators/plan.decorator.js';
import { CodigoError, errorDeNegocio } from '../errores.js';
import { contextoActual } from '../tenant/contexto-tenant.js';

const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Aplica la suscripcion de la empresa en el backend (no solo en la interfaz):
 * - empresa suspendida: no puede operar;
 * - suscripcion vencida o inexistente: queda en solo lectura;
 * - @RequiereFuncion: la funcion tiene que estar incluida en el plan.
 */
@Injectable()
export class SuscripcionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly empresas: EmpresasService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const { empresaId, plataforma } = contextoActual();
    if (plataforma || empresaId === null) return true;

    const metadatos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SIN_VERIFICAR_SUSCRIPCION, metadatos)) {
      return true;
    }

    const estado = await this.empresas.estadoDe(empresaId);
    const metodo = contexto.switchToHttp().getRequest<Request>().method;

    if (estado.estado === 'empresa_suspendida') {
      throw errorDeNegocio(
        ForbiddenException,
        CodigoError.EMPRESA_SUSPENDIDA,
        'La empresa esta suspendida. Comunicate con FashionStore.',
      );
    }
    if (
      (estado.estado === 'vencida' || estado.estado === 'sin_suscripcion') &&
      !METODOS_DE_LECTURA.has(metodo)
    ) {
      throw errorDeNegocio(
        ForbiddenException,
        CodigoError.SUSCRIPCION_VENCIDA,
        'La suscripcion de la empresa esta vencida: solo se puede consultar. Renova el plan para seguir operando.',
      );
    }

    const funcion = this.reflector.getAllAndOverride<FuncionDePlan | undefined>(
      FUNCION_DE_PLAN,
      metadatos,
    );
    if (funcion) await this.empresas.verificarFuncion(empresaId, funcion);

    return true;
  }
}
