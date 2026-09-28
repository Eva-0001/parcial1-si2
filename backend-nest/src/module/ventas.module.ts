import { Module } from '@nestjs/common';
import { ArchivosModule } from '../commons/archivos/archivos.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComprobantesController } from '../controllers/comprobantes.controller.js';
import { EnviosController } from '../controllers/envios.controller.js';
import { PagosController } from '../controllers/pagos.controller.js';
import { VentasController } from '../controllers/ventas.controller.js';
import { Ciudad } from '../entities/ciudad.entity.js';
import { MovimientoCaja } from '../entities/movimiento-caja.entity.js';
import { TurnoCaja } from '../entities/turno-caja.entity.js';
import { Comprobante } from '../entities/comprobante.entity.js';
import { DetalleVenta } from '../entities/detalle-venta.entity.js';
import { Envio } from '../entities/envio.entity.js';
import { EventoEnvio } from '../entities/evento-envio.entity.js';
import { ProductoSucursal } from '../entities/producto-sucursal.entity.js';
import { Usuario } from '../entities/usuario.entity.js';
import { Venta } from '../entities/venta.entity.js';
import { ComprobantesRepository } from '../repositories/comprobantes.repository.js';
import { EnviosRepository } from '../repositories/envios.repository.js';
import { VentasRepository } from '../repositories/ventas.repository.js';
import { ComprobantesService } from '../services/comprobantes.service.js';
import { EnviosService } from '../services/envios.service.js';
import { PagosService } from '../services/pagos.service.js';
import { VentasService } from '../services/ventas.service.js';
import { BitacoraModule } from './bitacora.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Venta,
      DetalleVenta,
      Comprobante,
      ProductoSucursal,
      Usuario,
      Envio,
      EventoEnvio,
      Ciudad,
      TurnoCaja,
      MovimientoCaja,
    ]),
    BitacoraModule,
    ArchivosModule,
  ],
  controllers: [
    VentasController,
    PagosController,
    ComprobantesController,
    EnviosController,
  ],
  providers: [
    VentasRepository,
    ComprobantesRepository,
    EnviosRepository,
    VentasService,
    PagosService,
    ComprobantesService,
    EnviosService,
  ],
  exports: [VentasService, PagosService],
})
export class VentasModule {}
