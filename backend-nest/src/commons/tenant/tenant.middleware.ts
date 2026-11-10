import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { EmpresasService } from '../../services/empresas.service.js';
import { type ContextoTenant, ejecutarConContexto } from './contexto-tenant.js';

/** Cabecera con la que la tienda (web o movil) dice de que empresa es. */
export const CABECERA_EMPRESA = 'x-empresa';

/**
 * Empresa que se usa en rutas publicas cuando el cliente no manda la cabecera.
 * Mantiene funcionando a los clientes de una sola tienda (la app movil).
 * Vacio = sin empresa por defecto.
 */
const EMPRESA_POR_DEFECTO = (process.env.EMPRESA_POR_DEFECTO ?? 'fashionstore').trim();

export type PeticionConEmpresa = Request & {
  /** La empresa vino en la cabecera X-Empresa (no es la de por defecto). */
  empresaExplicita?: number;
};

/**
 * Abre el contexto multiempresa de cada peticion. Con la cabecera X-Empresa
 * (slug) fija la empresa para las rutas publicas (catalogo, registro de
 * clientes). Si la peticion trae token, el guard JWT lo reemplaza por la
 * empresa del usuario.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly empresas: EmpresasService) {}

  async use(peticion: PeticionConEmpresa, _respuesta: Response, siguiente: NextFunction) {
    const contexto: ContextoTenant = { empresaId: null, plataforma: false };

    try {
      const cabecera = peticion.headers[CABECERA_EMPRESA];
      const slug = (Array.isArray(cabecera) ? cabecera[0] : cabecera)?.trim();

      if (slug) {
        const id = await this.empresas.idPorSlug(slug);
        if (id !== null) {
          contexto.empresaId = id;
          peticion.empresaExplicita = id;
        }
        // Slug desconocido: sin empresa. Las rutas publicas devuelven vacio
        // y las privadas usan la del token.
      } else if (EMPRESA_POR_DEFECTO) {
        contexto.empresaId = await this.empresas.idPorSlug(EMPRESA_POR_DEFECTO);
      }
    } catch (error) {
      siguiente(error);
      return;
    }

    ejecutarConContexto(contexto, () => siguiente());
  }
}
