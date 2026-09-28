import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlmacenesController } from '../controllers/almacenes.controller.js';
import { Almacen } from '../entities/almacen.entity.js';
import { Ciudad } from '../entities/ciudad.entity.js';
import { MovimientoAlmacen } from '../entities/movimiento-almacen.entity.js';
import { Producto } from '../entities/producto.entity.js';
import { ProductoAlmacen } from '../entities/producto-almacen.entity.js';
import { Sucursal } from '../entities/sucursal.entity.js';
import { AlmacenesRepository } from '../repositories/almacenes.repository.js';
import { AlmacenesService } from '../services/almacenes.service.js';
import { BitacoraModule } from './bitacora.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Almacen,
      ProductoAlmacen,
      MovimientoAlmacen,
      Ciudad,
      Sucursal,
      Producto,
    ]),
    BitacoraModule,
  ],
  controllers: [AlmacenesController],
  providers: [AlmacenesRepository, AlmacenesService],
})
export class AlmacenesModule {}
