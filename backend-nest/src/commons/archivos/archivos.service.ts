import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Configuracion } from '../../config/configuracion.js';

export const URL_PUBLICA_UPLOADS = '/uploads';

/**
 * Carpeta de archivos privados (comprobantes de pago) dentro de uploads. Empieza con
 * punto y el servidor estatico rechaza esas rutas (dotfiles: 'deny'): solo se leen por
 * endpoints que controlan quien los pide.
 */
const CARPETA_PRIVADA = '.privado';

export const TIPO_POR_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpe': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export const EXTENSIONES_PERMITIDAS = [
  '.jpg',
  '.jpeg',
  '.jpe',
  '.png',
  '.webp',
  '.gif',
];

@Injectable()
export class ArchivosService {
  private readonly carpeta: string;

  constructor(config: ConfigService<Configuracion, true>) {
    this.carpeta = config.get('uploads', { infer: true }).carpeta;
  }

  async guardar(
    archivo: Express.Multer.File,
    subcarpeta: string,
  ): Promise<string> {
    const extension = this.extensionValida(archivo);
    const destino = join(this.carpeta, subcarpeta);
    await mkdir(destino, { recursive: true });

    const nombre = `${randomUUID()}${extension}`;
    await writeFile(join(destino, nombre), archivo.buffer);

    return `${URL_PUBLICA_UPLOADS}/${subcarpeta}/${nombre}`;
  }

  /** Guarda una imagen privada y devuelve su clave ("comprobantes/uuid.png"). */
  async guardarPrivado(
    archivo: Express.Multer.File,
    subcarpeta: string,
  ): Promise<string> {
    const extension = this.extensionValida(archivo);
    const destino = join(this.carpeta, CARPETA_PRIVADA, subcarpeta);
    await mkdir(destino, { recursive: true });

    const nombre = `${randomUUID()}${extension}`;
    await writeFile(join(destino, nombre), archivo.buffer);
    return `${subcarpeta}/${nombre}`;
  }

  /** Ruta en disco y tipo de un archivo privado; null si la clave no es valida. */
  privado(
    clave: string | null | undefined,
  ): { ruta: string; tipo: string } | null {
    if (!clave) return null;
    const base = join(this.carpeta, CARPETA_PRIVADA);
    const ruta = normalize(join(base, clave));
    // Evita que una clave con ".." salga de la carpeta privada.
    if (!ruta.startsWith(base + sep)) return null;
    const tipo = TIPO_POR_EXTENSION[extname(ruta).toLowerCase()];
    return tipo ? { ruta, tipo } : null;
  }

  async eliminarPrivado(clave: string | null | undefined): Promise<void> {
    const archivo = this.privado(clave);
    if (archivo) await unlink(archivo.ruta).catch(() => undefined);
  }

  private extensionValida(archivo: Express.Multer.File): string {
    const extension = extname(archivo.originalname ?? '').toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
      throw new BadRequestException(
        `Solo se aceptan imagenes: ${EXTENSIONES_PERMITIDAS.join(', ')}`,
      );
    }
    return extension;
  }

  async eliminar(rutaPublica: string | null | undefined): Promise<void> {
    if (!rutaPublica?.startsWith(`${URL_PUBLICA_UPLOADS}/`)) return;

    const relativa = rutaPublica.slice(URL_PUBLICA_UPLOADS.length + 1);
    await unlink(join(this.carpeta, relativa)).catch(() => undefined);
  }
}
