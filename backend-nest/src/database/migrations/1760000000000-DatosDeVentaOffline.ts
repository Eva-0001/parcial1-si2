import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos obligatorios de una venta hecha sin conexion (seccion 7.2 del examen):
 * de donde vino, la hora real que informo el equipo (sin acotar al turno),
 * cuando llego al servidor y, si el precio habia cambiado, quien autorizo
 * respetar el precio cobrado. Los precios usados quedan en detalle_venta
 * (precio cobrado y precio_lista vigente en el servidor).
 */
export class DatosDeVentaOffline1760000000000 implements MigrationInterface {
  name = 'DatosDeVentaOffline1760000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE ventas
         ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'en_linea',
         ADD COLUMN IF NOT EXISTS registrada_en_dispositivo TIMESTAMP,
         ADD COLUMN IF NOT EXISTS sincronizada_en TIMESTAMP,
         ADD COLUMN IF NOT EXISTS precios_autorizados_por INTEGER
           REFERENCES usuarios (id) ON DELETE SET NULL`,
    );
    await q.query(
      `ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ck_ventas_origen`,
    );
    await q.query(
      `ALTER TABLE ventas ADD CONSTRAINT ck_ventas_origen
         CHECK (origen IN ('en_linea', 'sin_conexion'))`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ck_ventas_origen`,
    );
    await q.query(
      `ALTER TABLE ventas
         DROP COLUMN IF EXISTS precios_autorizados_por,
         DROP COLUMN IF EXISTS sincronizada_en,
         DROP COLUMN IF EXISTS registrada_en_dispositivo,
         DROP COLUMN IF EXISTS origen`,
    );
  }
}
