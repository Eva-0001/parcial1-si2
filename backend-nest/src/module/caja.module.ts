import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CajaController } from '../controllers/caja.controller.js';
import { MovimientoCaja } from '../entities/movimiento-caja.entity.js';
import { Sucursal } from '../entities/sucursal.entity.js';
import { TurnoCaja } from '../entities/turno-caja.entity.js';
import { Venta } from '../entities/venta.entity.js';
import { CajaRepository } from '../repositories/caja.repository.js';
import { CajaService } from '../services/caja.service.js';
import { BitacoraModule } from './bitacora.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TurnoCaja, MovimientoCaja, Venta, Sucursal]),
    BitacoraModule,
  ],
  controllers: [CajaController],
  providers: [CajaRepository, CajaService],
})
export class CajaModule {}
