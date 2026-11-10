import { Module } from '@nestjs/common';
import { MlController } from '../controllers/ml.controller.js';
import { MlRepository } from '../repositories/ml.repository.js';
import { MlService } from '../services/ml.service.js';

/** Analitica inteligente: datos sinteticos, modelos de ML y sus resultados. */
@Module({
  controllers: [MlController],
  providers: [MlRepository, MlService],
  exports: [MlService],
})
export class MlModule {}
