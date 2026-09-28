import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ArchivosService } from '../commons/archivos/archivos.service.js';
import type {
  ActualizarProductoDto,
  CrearProductoDto,
  FiltroProductosDto,
} from '../dto/producto.dto.js';
import type { Producto } from '../entities/producto.entity.js';
import { ModelosRepository } from '../repositories/modelos.repository.js';
import { ProductosRepository } from '../repositories/productos.repository.js';
import { ModelosService, nombreVariante } from './modelos.service.js';

const NO_ENCONTRADO = 'Producto no encontrado';

const CARPETA_FOTOS = 'productos';

@Injectable()
export class ProductosService {
  constructor(
    private readonly repo: ProductosRepository,
    private readonly modelosRepo: ModelosRepository,
    private readonly modelos: ModelosService,
    private readonly archivos: ArchivosService,
  ) {}

  listar(filtro: FiltroProductosDto): Promise<Producto[]> {
    return this.repo.listar(filtro);
  }

  async obtener(id: number): Promise<Producto> {
    const producto = await this.repo.obtener(id);
    if (!producto) throw new NotFoundException(NO_ENCONTRADO);
    return producto;
  }

  async obtenerCompleto(id: number): Promise<Producto> {
    const producto = await this.repo.obtenerCompleto(id);
    if (!producto) throw new NotFoundException(NO_ENCONTRADO);
    return producto;
  }

  /** Agrega una variante (talla x color) a un modelo existente. */
  crear(datos: CrearProductoDto): Promise<Producto> {
    const { modelo_id: modeloId, ...variante } = datos;
    return this.modelos.agregarVariante(modeloId, variante);
  }

  /** Edita lo propio de la variante; lo comun (nombre base, categoria...) va por el modelo. */
  async actualizar(
    id: number,
    datos: ActualizarProductoDto,
  ): Promise<Producto> {
    const producto = await this.obtener(id);
    await this.verificarCatalogos(datos);

    Object.assign(producto, datos);
    if (datos.sku !== undefined) producto.sku = datos.sku.trim();
    this.modelos.verificarPrecioMayor(producto.precio, producto.precio_mayor);

    if (datos.color_id !== undefined || datos.talla_id !== undefined) {
      const modelo = await this.modelos.obtener(producto.modelo_id);
      const { color, talla } = await this.modelosRepo.nombres(
        producto.color_id,
        producto.talla_id,
      );
      producto.nombre = nombreVariante(modelo.nombre, color, talla);
    }

    await this.modelos.conUnicidad(() => this.repo.guardar(producto));
    return this.obtenerCompleto(id);
  }

  async eliminar(id: number): Promise<{ mensaje: string }> {
    const producto = await this.obtener(id);

    if (await this.repo.tieneStock(id)) {
      throw new ConflictException(
        'No se puede eliminar el producto porque tiene stock en sucursales o movimientos en almacenes',
      );
    }

    await this.archivos.eliminar(producto.foto);
    await this.repo.eliminar(id);
    return { mensaje: 'Producto eliminado' };
  }

  async cambiarFoto(
    id: number,
    archivo: Express.Multer.File,
  ): Promise<Producto> {
    const producto = await this.obtener(id);
    const ruta = await this.archivos.guardar(archivo, CARPETA_FOTOS);

    await this.archivos.eliminar(producto.foto);
    producto.foto = ruta;
    return this.repo.guardar(producto);
  }

  async quitarFoto(id: number): Promise<Producto> {
    const producto = await this.obtener(id);

    await this.archivos.eliminar(producto.foto);
    producto.foto = null;
    return this.repo.guardar(producto);
  }

  private async verificarCatalogos(
    datos: CrearProductoDto | ActualizarProductoDto,
  ): Promise<void> {
    const error = await this.repo.catalogoInvalido({ ...datos });
    if (error) throw new BadRequestException(error);
  }
}
