import {
  ClassSerializerInterceptor,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HttpExceptionFilter } from './commons/filters/http-exception.filter.js';
import { JwtAuthGuard } from './commons/guards/jwt-auth.guard.js';
import { RolesGuard } from './commons/guards/roles.guard.js';
import { SuscripcionGuard } from './commons/guards/suscripcion.guard.js';
import { instalarAislamientoPorEmpresa } from './commons/tenant/aislamiento-rls.js';
import { TenantMiddleware } from './commons/tenant/tenant.middleware.js';
import { EmpresasModule } from './module/empresas.module.js';
import { configuracion, type Configuracion } from './config/configuracion.js';
import { opcionesDeDataSource } from './config/data-source.js';
import { Usuario } from './entities/usuario.entity.js';
import { AlmacenesModule } from './module/almacenes.module.js';
import { AuthModule } from './module/auth.module.js';
import { BitacoraModule } from './module/bitacora.module.js';
import { CajaModule } from './module/caja.module.js';
import { CambiosModule } from './module/cambios.module.js';
import { CatalogosModule } from './module/catalogos.module.js';
import { IaModule } from './module/ia.module.js';
import { ProductosModule } from './module/productos.module.js';
import { ReportesModule } from './module/reportes.module.js';
import { ReservasModule } from './module/reservas.module.js';
import { RolesModule } from './module/roles.module.js';
import { SucursalesModule } from './module/sucursales.module.js';
import { SyncModule } from './module/sync.module.js';
import { TrabajadoresModule } from './module/trabajadores.module.js';
import { UsuariosModule } from './module/usuarios.module.js';
import { VentasModule } from './module/ventas.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuracion],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuracion, true>) =>
        opcionesDeDataSource(
          config.get('db', { infer: true }).url,
          config.get('esProduccion', { infer: true }),
        ),
      // Cada conexion del pool recibe la empresa de la peticion (RLS).
      dataSourceFactory: async (opciones?: DataSourceOptions) => {
        const dataSource = new DataSource(opciones as DataSourceOptions);
        instalarAislamientoPorEmpresa(dataSource);
        return dataSource.initialize();
      },
    }),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuracion, true>) => {
        const jwt = config.get('jwt', { infer: true });
        return {
          secret: jwt.secreto,
          signOptions: { expiresIn: jwt.expiraEnMinutos * 60 },
        };
      },
    }),

    TypeOrmModule.forFeature([Usuario]),

    AuthModule,
    EmpresasModule,
    RolesModule,
    UsuariosModule,
    TrabajadoresModule,
    SucursalesModule,
    CatalogosModule,
    ProductosModule,
    VentasModule,
    CambiosModule,
    CajaModule,
    ReservasModule,
    AlmacenesModule,
    BitacoraModule,
    ReportesModule,
    IaModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SuscripcionGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*path');
  }
}
