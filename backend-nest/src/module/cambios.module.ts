import { Module } from '@nestjs/common';
import { CambiosController } from '../controllers/cambios.controller.js';
import { CambiosRepository } from '../repositories/cambios.repository.js';
import { CambiosService } from '../services/cambios.service.js';
import { BitacoraModule } from './bitacora.module.js';

/** Cambios de prendas dentro del plazo de la empresa. */
@Module({
  imports: [BitacoraModule],
  controllers: [CambiosController],
  providers: [CambiosRepository, CambiosService],
})
export class CambiosModule {}
