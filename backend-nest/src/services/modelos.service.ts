import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type EntityManager, QueryFailedError } from 'typeorm';
import { ArchivosService } from '../commons/archivos/archivos.service.js';
import { aCentavos } from '../commons/dinero.js';
import type {
  ActualizarModeloDto,
  CrearModeloDto,
  FiltroModelosDto,
  VarianteDto,
} from '../dto/modelo.dto.js';
import { Modelo } from '../entities/modelo.entity.js';
import { Producto } from '../entities/producto.entity.js';
import { ModelosRepository } from '../repositories/modelos.repository.js';
import { ProductosRepository } from '../repositories/productos.repository.js';

const NO_ENCONTRADO = 'Producto no encontrado';
const VIOLACION_DE_UNICIDAD = '23505';

/** Datos del modelo que se copian a cada variante (lo que leen reportes, IA y la app movil). */
const CAMPOS_COMUNES = [
  'categoria_id',
  'coleccion_id',
  'temporada_id',
  'proveedor_id',
  'precio_mayor',
  'minimo_mayor',
] as const;

/** "Polera X - Negro - Talla M". */
export function nombreVariante(
  modelo: string,
  color: string | null,
  talla: string | null,
): string {
  return [modelo, color, talla ? `Talla ${talla}` : null]
    .filter(Boolean)
    .join(' - ');
}

export const skuGenerado = (id: number) => `FS-${String(id).padStart(6, '0')}`;

@Injectable()
export class ModelosService {
  constructor(
    private readonly repo: ModelosRepository,
    private readonly productos: ProductosRepository,
    private readonly archivos: ArchivosService,
  ) {}

  async listar(filtro: FiltroModelosDto) {
    const [modelos, stocks] = await Promise.all([
      this.repo.listar(filtro),
      this.repo.stockPorModelo(),
    ]);
    const stockPorModelo = new Map(stocks.map((s) => [s.modelo_id, s.stock]));
    return modelos.map((modelo) => ({
      ...modelo,
      stock: stockPorModelo.get(modelo.id) ?? 0,
    }));
  }

  async obtener(id: number): Promise<Modelo> {
    const modelo = await this.repo.obtener(id);
    if (!modelo) throw new NotFoundException(NO_ENCONTRADO);
    return modelo;
  }

  async crear(datos: CrearModeloDto): Promise<Modelo> {
    const { variantes = [], ...campos } = datos;
    await this.verificarCatalogos(campos);
    this.verificarPrecioMayor(campos.precio, campos.precio_mayor ?? null);
    await this.verificarVariantes(
      variantes,
      campos.precio,
      campos.precio_mayor ?? null,
    );

    const id = await this.conUnicidad(() =>
      this.repo.transaccion(async (manager) => {
        const modelo = await manager.getRepository(Modelo).save(
          manager.getRepository(Modelo).create({
            ...campos,
            nombre: campos.nombre.trim(),
            descripcion: campos.descripcion?.trim() || null,
          }),
        );
        for (const variante of variantes) {
          await this.crearVariante(manager, modelo, variante);
        }
        return modelo.id;
      }),
    );

    return this.obtener(id);
  }

  async actualizar(id: number, datos: ActualizarModeloDto): Promise<Modelo> {
    const modelo = await this.obtener(id);
    const { aplicar_precio: aplicarPrecio, ...campos } = datos;
    await this.verificarCatalogos(campos);

    Object.assign(modelo, campos);
    if (campos.nombre !== undefined) modelo.nombre = campos.nombre.trim();
    if (campos.descripcion !== undefined) {
      modelo.descripcion = campos.descripcion?.trim() || null;
    }
    this.verificarPrecioMayor(modelo.precio, modelo.precio_mayor);

    const variantes = modelo.variantes ?? [];
    for (const variante of variantes) {
      const precio = aplicarPrecio ? modelo.precio : variante.precio;
      this.verificarPrecioMayor(precio, modelo.precio_mayor, variante.nombre);
    }

    await this.repo.transaccion(async (manager) => {
      const { variantes: _omitidas, ...soloModelo } = modelo;
      await manager.getRepository(Modelo).save(soloModelo);

      for (const variante of variantes) {
        await manager.getRepository(Producto).update(
          { id: variante.id },
          {
            ...Object.fromEntries(CAMPOS_COMUNES.map((c) => [c, modelo[c]])),
            nombre: nombreVariante(
              modelo.nombre,
              variante.color?.nombre ?? null,
              variante.talla?.nombre ?? null,
            ),
            ...(aplicarPrecio ? { precio: modelo.precio } : {}),
          },
        );
      }
    });

    return this.obtener(id);
  }

  async eliminar(id: number): Promise<{ mensaje: string }> {
    const modelo = await this.obtener(id);
    const variantes = modelo.variantes ?? [];

    for (const variante of variantes) {
      if (await this.productos.tieneStock(variante.id)) {
        throw new ConflictException(
          `No se puede eliminar: "${variante.nombre}" tiene stock en sucursales o movimientos en almacenes`,
        );
      }
    }

    await this.repo.transaccion(async (manager) => {
      await manager.getRepository(Producto).delete({ modelo_id: id });
      await manager.getRepository(Modelo).delete({ id });
    });
    for (const variante of variantes) {
      await this.archivos.eliminar(variante.foto);
    }

    return { mensaje: 'Producto eliminado con todas sus variantes' };
  }

  async agregarVariante(
    modeloId: number,
    datos: VarianteDto,
  ): Promise<Producto> {
    const modelo = await this.obtener(modeloId);
    const existentes = (modelo.variantes ?? []).map((v) => ({
      color_id: v.color_id,
      talla_id: v.talla_id,
    }));
    await this.verificarVariantes(
      [...existentes, datos],
      modelo.precio,
      modelo.precio_mayor,
    );

    const id = await this.conUnicidad(() =>
      this.repo.transaccion((manager) =>
        this.crearVariante(manager, modelo, datos),
      ),
    );
    return (await this.productos.obtenerCompleto(id))!;
  }

  /** Crea la variante copiando los datos comunes del modelo. Devuelve su id. */
  async crearVariante(
    manager: EntityManager,
    modelo: Modelo,
    datos: VarianteDto,
  ): Promise<number> {
    const { color, talla } = await this.repo.nombres(
      datos.color_id,
      datos.talla_id,
      manager,
    );
    const repo = manager.getRepository(Producto);
    const producto = await repo.save(
      repo.create({
        ...Object.fromEntries(CAMPOS_COMUNES.map((c) => [c, modelo[c]])),
        modelo_id: modelo.id,
        nombre: nombreVariante(modelo.nombre, color, talla),
        precio: datos.precio ?? modelo.precio,
        color_id: datos.color_id ?? null,
        talla_id: datos.talla_id ?? null,
        // El sku definitivo usa el id, que recien existe despues de insertar.
        sku: datos.sku?.trim() || `TMP-${randomUUID()}`,
      }),
    );
    if (!datos.sku?.trim()) {
      await repo.update({ id: producto.id }, { sku: skuGenerado(producto.id) });
    }
    return producto.id;
  }

  /** Colores y tallas existentes, sin combinaciones repetidas y con precio valido. */
  private async verificarVariantes(
    variantes: VarianteDto[],
    precioModelo: string,
    precioMayor: string | null,
  ): Promise<void> {
    const vistas = new Set<string>();
    for (const v of variantes) {
      const invalido = await this.productos.catalogoInvalido({
        color_id: v.color_id,
        talla_id: v.talla_id,
      });
      if (invalido) throw new BadRequestException(invalido);

      const combo = `${v.color_id ?? ''}|${v.talla_id ?? ''}`;
      if (vistas.has(combo)) {
        throw new ConflictException(
          'Hay variantes repetidas: cada combinacion de color y talla va una sola vez',
        );
      }
      vistas.add(combo);

      this.verificarPrecioMayor(v.precio ?? precioModelo, precioMayor);
    }
  }

  private async verificarCatalogos(campos: Record<string, unknown>) {
    const invalido = await this.productos.catalogoInvalido(campos);
    if (invalido) throw new BadRequestException(invalido);
  }

  verificarPrecioMayor(
    precio: string,
    precioMayor: string | null,
    variante?: string,
  ): void {
    if (precioMayor === null) return;
    if (aCentavos(precioMayor) <= 0) {
      throw new BadRequestException(
        'El precio por mayor debe ser mayor a cero',
      );
    }
    if (aCentavos(precioMayor) >= aCentavos(precio)) {
      throw new BadRequestException(
        variante
          ? `El precio por mayor debe ser menor que el precio de "${variante}" (Bs ${precio})`
          : 'El precio por mayor debe ser menor que el precio por menor',
      );
    }
  }

  /** Traduce la violacion de un indice unico (variante o sku repetido) a un 409. */
  async conUnicidad<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code ===
          VIOLACION_DE_UNICIDAD
      ) {
        throw new ConflictException(
          'Ya existe esa combinacion de color y talla en el producto, o el SKU esta en uso',
        );
      }
      throw error;
    }
  }
}
