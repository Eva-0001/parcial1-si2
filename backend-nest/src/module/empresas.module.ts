import { Global, Module } from '@nestjs/common';
import { EmpresasController } from '../controllers/empresas.controller.js';
import { PlataformaController } from '../controllers/plataforma.controller.js';
import { EmpresasRepository } from '../repositories/empresas.repository.js';
import { EmpresasService } from '../services/empresas.service.js';
import { AuthModule } from './auth.module.js';
import { UsuariosModule } from './usuarios.module.js';

/** Multiempresa (SaaS): empresas, planes y suscripciones. */
@Global()
@Module({
  imports: [AuthModule, UsuariosModule],
  controllers: [EmpresasController, PlataformaController],
  providers: [EmpresasRepository, EmpresasService],
  exports: [EmpresasService],
})
export class EmpresasModule {}
