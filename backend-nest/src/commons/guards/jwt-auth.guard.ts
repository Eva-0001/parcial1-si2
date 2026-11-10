import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Usuario } from '../../entities/usuario.entity.js';
import {
  ACCESO_PLATAFORMA,
  type AccesoPlataforma,
} from '../decorators/plataforma.decorator.js';
import { PUBLICO } from '../decorators/publico.decorator.js';
import { ROL_SUPERADMIN } from '../enums/rol.enum.js';
import { CodigoError, errorDeNegocio } from '../errores.js';
import { contextoActual } from '../tenant/contexto-tenant.js';

export interface ContenidoDelToken {
  sub: string;
  username: string;
  rol_id: number;
  /** Empresa del usuario; null para el superadmin de la plataforma. */
  empresa_id: number | null;
  plataforma: boolean;
}

export function esSuperadmin(usuario: Pick<Usuario, 'empresa_id' | 'rol'>): boolean {
  return usuario.empresa_id === null && usuario.rol?.nombre === ROL_SUPERADMIN;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const metadatos = [contexto.getHandler(), contexto.getClass()];
    const esPublico = this.reflector.getAllAndOverride<boolean>(PUBLICO, metadatos);
    const accesoPlataforma = this.reflector.getAllAndOverride<AccesoPlataforma | undefined>(
      ACCESO_PLATAFORMA,
      metadatos,
    );
    const peticion = contexto
      .switchToHttp()
      .getRequest<Request & { usuario?: Usuario }>();
    const [tipo, token] = peticion.headers.authorization?.split(' ') ?? [];
    const contenido =
      tipo?.toLowerCase() === 'bearer' && token
        ? await this.leerToken(token)
        : null;

    if (esPublico) {
      // Ruta publica con sesion: el catalogo tiene que ser el de la empresa
      // del usuario, no el de la cabecera o el de por defecto.
      // (El superadmin no tiene tienda: en rutas publicas sigue la cabecera.)
      if (contenido && !contenido.plataforma) this.fijarEmpresa(contenido);
      return true;
    }

    if (!token) throw new UnauthorizedException('Token requerido');
    if (!contenido) throw new UnauthorizedException('Token invalido o vencido');

    const tenant = this.fijarEmpresa(contenido);

    const usuario = await this.usuarios.findOne({
      where: { id: Number(contenido.sub) },
      relations: { rol: true },
    });
    // Con RLS activa, un usuario de otra empresa ni siquiera se encuentra.
    if (!usuario) throw new UnauthorizedException('Token invalido o vencido');
    if (tenant.plataforma !== esSuperadmin(usuario)) {
      throw new UnauthorizedException('Token invalido o vencido');
    }

    if (accesoPlataforma === 'solo' && !tenant.plataforma) {
      throw errorDeNegocio(
        ForbiddenException,
        CodigoError.SOLO_PLATAFORMA,
        'Solo el administrador de la plataforma puede hacer esto',
      );
    }
    if (tenant.plataforma && !accesoPlataforma) {
      throw errorDeNegocio(
        ForbiddenException,
        CodigoError.SOLO_PLATAFORMA,
        'El administrador de la plataforma no opera tiendas: entra con un usuario de la empresa',
      );
    }

    peticion.usuario = usuario;
    return true;
  }

  /** Token verificado, o null si es invalido, vencido o anterior al multiempresa. */
  private async leerToken(token: string): Promise<ContenidoDelToken | null> {
    try {
      const contenido = await this.jwt.verifyAsync<ContenidoDelToken>(token);
      return contenido.empresa_id === undefined ? null : contenido;
    } catch {
      return null;
    }
  }

  /**
   * El token manda: desde aca todas las consultas (y RLS) usan la empresa del
   * usuario, no la que haya pedido la cabecera X-Empresa.
   */
  private fijarEmpresa(contenido: ContenidoDelToken) {
    const tenant = contextoActual();
    if (!Object.isFrozen(tenant)) {
      tenant.plataforma = contenido.plataforma === true;
      tenant.empresaId = tenant.plataforma ? null : contenido.empresa_id;
    }
    return tenant;
  }
}
