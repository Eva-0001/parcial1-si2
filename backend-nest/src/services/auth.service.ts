import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { instanceToPlain } from 'class-transformer';
import { CodigoError, errorDeNegocio } from '../commons/errores.js';
import {
  type ContenidoDelToken,
  esSuperadmin,
} from '../commons/guards/jwt-auth.guard.js';
import { verificarPassword } from '../commons/passwords.js';
import {
  comoPlataforma,
  contextoActual,
  enEmpresa,
} from '../commons/tenant/contexto-tenant.js';
import type { Configuracion } from '../config/configuracion.js';
import type { LoginDto, RegistroDto } from '../dto/auth.dto.js';
import type { Sesion } from '../entities/sesion.entity.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { SesionesRepository } from '../repositories/sesiones.repository.js';
import { UsuariosRepository } from '../repositories/usuarios.repository.js';
import { UsuariosService } from './usuarios.service.js';

export interface RespuestaDeToken {
  access_token: string;
  token_type: string;
  refresh_token: string;
  usuario: unknown;
  /** Empresa del usuario; null para el superadmin de la plataforma. */
  empresa: { id: number; nombre: string; slug: string } | null;
}

const SESION_INVALIDA = 'La sesion ya no es valida, volve a iniciar sesion';

@Injectable()
export class AuthService {
  private readonly diasDeRefresco: number;

  constructor(
    private readonly repo: UsuariosRepository,
    private readonly usuarios: UsuariosService,
    private readonly sesiones: SesionesRepository,
    private readonly jwt: JwtService,
    config: ConfigService<Configuracion, true>,
  ) {
    this.diasDeRefresco = config.get('jwt', { infer: true }).refrescoEnDias;
  }

  /**
   * El username es unico en toda la plataforma, asi que el login no necesita
   * saber la empresa: se busca en todas y el token lleva la del usuario.
   * Si la tienda mando X-Empresa (empresaExplicita), el usuario tiene que ser
   * de esa empresa: un cliente de la tienda A no entra por la tienda B.
   */
  async login(
    datos: LoginDto,
    empresaExplicita?: number,
  ): Promise<RespuestaDeToken> {
    const usuario = await this.repo.porUsernameEnPlataforma(datos.username);

    if (
      !usuario ||
      !(await verificarPassword(datos.password, usuario.password)) ||
      (empresaExplicita !== undefined &&
        usuario.empresa_id !== empresaExplicita &&
        !esSuperadmin(usuario))
    ) {
      throw new UnauthorizedException('Usuario o password incorrectos');
    }

    return this.armarToken(usuario);
  }

  /** Registro de clientes: quedan en la empresa de la tienda (X-Empresa). */
  async registro(datos: RegistroDto): Promise<RespuestaDeToken> {
    const { empresaId } = contextoActual();
    if (empresaId === null) {
      throw errorDeNegocio(
        BadRequestException,
        CodigoError.EMPRESA_REQUERIDA,
        'Falta indicar la tienda (cabecera X-Empresa)',
      );
    }
    const usuario = await this.usuarios.registrarCliente(datos);
    const conRol = await this.repo.obtenerConRol(usuario.id);
    return this.armarToken(conRol ?? usuario);
  }

  // Cada refresh token sirve una sola vez: se borra y se entrega uno nuevo.
  async refrescar(refreshToken: string): Promise<RespuestaDeToken> {
    const sesion = await this.sesionValida(refreshToken);
    if (!sesion || !(await this.sesiones.borrar(sesion.id))) {
      throw this.sesionInvalida();
    }

    const usuario = await this.repo.obtenerConRolEnPlataforma(sesion.usuario_id);
    if (!usuario) throw this.sesionInvalida();

    return this.armarToken(usuario);
  }

  async cerrar(refreshToken: string): Promise<{ mensaje: string }> {
    const sesion = await this.sesionValida(refreshToken);
    if (sesion) await this.sesiones.borrar(sesion.id);
    return { mensaje: 'Sesion cerrada' };
  }

  /** `usuario` tiene que venir con su rol cargado. */
  async armarToken(usuario: Usuario): Promise<RespuestaDeToken> {
    const plataforma = esSuperadmin(usuario);
    const contenido: ContenidoDelToken = {
      sub: String(usuario.id),
      username: usuario.username,
      rol_id: usuario.rol_id,
      empresa_id: plataforma ? null : usuario.empresa_id,
      plataforma,
    };
    const access_token = await this.jwt.signAsync(contenido);

    const enSuContexto = <T>(fn: () => Promise<T>) =>
      plataforma || usuario.empresa_id === null
        ? comoPlataforma(fn)
        : enEmpresa(usuario.empresa_id, fn);

    return {
      access_token,
      token_type: 'bearer',
      refresh_token: await enSuContexto(() => this.abrirSesion(usuario.id)),
      usuario: instanceToPlain(usuario),
      empresa:
        contenido.empresa_id === null
          ? null
          : await this.repo.empresaPublica(contenido.empresa_id),
    };
  }

  private async abrirSesion(usuarioId: number): Promise<string> {
    await this.sesiones.borrarVencidas(usuarioId);

    const id = randomUUID();
    const secreto = randomBytes(32).toString('base64url');
    const expira_en = new Date(
      Date.now() + this.diasDeRefresco * 24 * 60 * 60 * 1000,
    );

    await this.sesiones.crear({
      id,
      usuario_id: usuarioId,
      token_hash: this.hash(secreto),
      expira_en,
    });

    return `${id}.${secreto}`;
  }

  private async sesionValida(refreshToken: string): Promise<Sesion | null> {
    const [id, secreto] = refreshToken.split('.');
    if (!id || !secreto || !/^[0-9a-f-]{36}$/i.test(id)) return null;

    const sesion = await this.sesiones.obtener(id);
    if (!sesion || sesion.expira_en.getTime() < Date.now()) return null;

    const esperado = Buffer.from(sesion.token_hash, 'hex');
    const recibido = Buffer.from(this.hash(secreto), 'hex');
    return timingSafeEqual(esperado, recibido) ? sesion : null;
  }

  private hash(secreto: string): string {
    return createHash('sha256').update(secreto).digest('hex');
  }

  private sesionInvalida() {
    return errorDeNegocio(
      UnauthorizedException,
      CodigoError.SESION_INVALIDA,
      SESION_INVALIDA,
    );
  }
}
