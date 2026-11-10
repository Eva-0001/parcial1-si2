import { ForbiddenException, Injectable } from '@nestjs/common';
import { Rol } from '../commons/enums/rol.enum.js';
import type {
  FiltroReporteInventarioDto,
  FiltroReporteVentasDto,
  ParametrosReporte,
  TipoReporte,
} from '../dto/reporte.dto.js';
import type { Usuario } from '../entities/usuario.entity.js';
import { MlService } from './ml.service.js';
import {
  type Periodo,
  ReportesRepository,
} from '../repositories/reportes.repository.js';

export interface ReporteTabular {
  tipo: TipoReporte;
  titulo: string;
  parametros: ParametrosReporte;
  grafico: Grafico;
  formato: 'bs' | 'entero';
  serie: { etiqueta: string; valor: number; detalle?: string }[];
  tabla: { encabezados: string[]; filas: (string | number)[][] };
  totales: Record<string, unknown>;
}

export type Grafico = 'barras' | 'lineas' | 'torta';

/**
 * Seleccion dinamica del grafico de una participacion (partes de un total):
 * torta con 3 a 8 partes (la web junta las menores en "Otros" a partir de 7);
 * con 2 partes o con muchas, barras ordenadas comparan mejor.
 */
export const graficoDeParticipacion = (partes: number): Grafico =>
  partes >= 3 && partes <= 8 ? 'torta' : 'barras';

/** Roles que solo ven reportes de la sucursal de su ficha de trabajador. */
const ROLES_DE_SUCURSAL: readonly string[] = [Rol.ENCARGADO, Rol.CAJERO];

export const limitadoASucursal = (usuario: Usuario) =>
  ROLES_DE_SUCURSAL.includes(usuario.rol?.nombre ?? '');

const bs = (valor: unknown) => Number(valor ?? 0).toFixed(2);

/** "2026-09" -> "Sep 2026" */
const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];
const nombreDeMes = (periodo: string) => {
  const [anio, mes] = periodo.split('-');
  return `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
};
/** Lunes "2026-09-07" -> "Sem. 07/09" */
const nombreDeSemana = (lunes: string) =>
  `Sem. ${lunes.slice(8, 10)}/${lunes.slice(5, 7)}`;

/** Como se agrupa cada tipo de reporte (para mostrarlo como filtro aplicado). */
export const AGRUPACION_DE_REPORTE: Record<TipoReporte, string> = {
  ventas_por_dia: 'Dia',
  ventas_por_semana: 'Semana',
  ventas_por_mes: 'Mes',
  ventas_por_sucursal: 'Sucursal',
  ventas_por_categoria: 'Categoria',
  top_productos: 'Prenda',
  inventario_por_sucursal: 'Sucursal',
  por_reponer: 'Prenda y sucursal',
  reservas: 'Reserva',
  prediccion_demanda: 'Sucursal y categoría',
  segmentos_clientes: 'Segmento de clientes',
};

const contarPor = (filas: Record<string, unknown>[], campo: string) => {
  const conteo = new Map<string, number>();
  for (const fila of filas) {
    const clave = String(fila[campo]);
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  return [...conteo].map(([etiqueta, valor]) => ({ etiqueta, valor }));
};

@Injectable()
export class ReportesService {
  constructor(
    private readonly repo: ReportesRepository,
    private readonly ml: MlService,
  ) {}

  async ventas(filtro: FiltroReporteVentasDto) {
    const rango = {
      desde: filtro.desde,
      hasta: filtro.hasta,
      sucursal_id: filtro.sucursal_id,
    };

    const [resumen, porDia, top] = await Promise.all([
      this.repo.resumenDeVentas(rango),
      this.repo.ventasPorDia(rango),
      this.repo.topProductos(rango, filtro.top ?? 10),
    ]);

    return {
      periodo: { desde: filtro.desde ?? null, hasta: filtro.hasta ?? null },
      sucursal_id: filtro.sucursal_id ?? null,
      resumen: resumen[0] ?? {
        ventas: 0,
        unidades: 0,
        importe: '0',
        clientes: 0,
      },
      por_dia: porDia,
      top_productos: top,
    };
  }

  async inventario(filtro: FiltroReporteInventarioDto) {
    const [porSucursal, reponer] = await Promise.all([
      this.repo.inventarioPorSucursal(filtro.sucursal_id),
      this.repo.porReponer(filtro.sucursal_id, filtro.umbral ?? 3),
    ]);

    return {
      sucursal_id: filtro.sucursal_id ?? null,
      por_sucursal: porSucursal,
      por_reponer: reponer,
    };
  }

  /**
   * Sucursal a la que queda limitado el reporte. Encargado y cajero solo ven la suya (la de su
   * ficha de trabajador), sin importar lo que pidan; el administrador ve la que pidio o todas.
   */
  async sucursalPermitida(
    usuario: Usuario,
    pedida?: number,
  ): Promise<number | undefined> {
    if (!limitadoASucursal(usuario)) return pedida;

    const propia = await this.repo.sucursalDeTrabajador(usuario.id);
    if (propia === null) {
      throw new ForbiddenException(
        'No tenes una sucursal asignada: pedile al administrador que te asigne una',
      );
    }
    if (pedida !== undefined && pedida !== propia) {
      throw new ForbiddenException('Solo podes ver reportes de tu sucursal');
    }
    return propia;
  }

  async dashboard(sucursalId?: number) {
    const [totales, inventario, reservas, top] = await Promise.all([
      this.repo.totalesDelDashboard(sucursalId),
      this.repo.inventarioPorSucursal(sucursalId),
      this.repo.reservasPendientes(sucursalId),
      this.repo.topProductos({ sucursal_id: sucursalId }, 5),
    ]);

    return {
      ventas: totales[0] ?? {
        importe_hoy: '0',
        ventas_hoy: 0,
        importe_mes: '0',
        ventas_mes: 0,
      },
      inventario,
      reservas_pendientes: reservas,
      top_productos: top,
    };
  }

  /** Reportes con forma de tabla + serie; son los que elige el generador con IA. */
  async generar(
    tipo: TipoReporte,
    parametros: ParametrosReporte,
  ): Promise<ReporteTabular> {
    const rango = {
      desde: parametros.desde,
      hasta: parametros.hasta,
      sucursal_id: parametros.sucursal_id,
      categoria_id: parametros.categoria_id,
      modelo_id: parametros.modelo_id,
    };

    switch (tipo) {
      case 'prediccion_demanda': {
        // Resultado del Random Forest entrenado (Analitica inteligente).
        const modelo = await this.ml.exigirModelo('demanda');
        type Pronostico = {
          sucursal_id: number;
          sucursal: string;
          categoria_id: number;
          categoria: string;
          semanas: { semana: string; unidades: number }[];
        };
        type Reposicion = {
          sucursal: string;
          categoria: string;
          stock_disponible: number;
          sugerido: number;
        };
        const reposicion = new Map(
          (modelo.resultados.reposicion as Reposicion[]).map((r) => [
            `${r.sucursal}|${r.categoria}`,
            r,
          ]),
        );
        const filas = (modelo.resultados.pronostico as Pronostico[]).filter(
          (p) =>
            (parametros.sucursal_id === undefined ||
              p.sucursal_id === parametros.sucursal_id) &&
            (parametros.categoria_id === undefined ||
              p.categoria_id === parametros.categoria_id),
        );
        const semanas = filas[0]?.semanas.map((s) => s.semana) ?? [];
        const totalPorSemana = semanas.map((semana, i) =>
          filas.reduce((s, f) => s + f.semanas[i].unidades, 0),
        );
        return {
          tipo,
          titulo: 'Prediccion de demanda (proximas 4 semanas)',
          parametros,
          grafico: 'lineas',
          formato: 'entero',
          serie: semanas.map((semana, i) => ({
            etiqueta: nombreDeSemana(semana),
            detalle: `${Math.round(totalPorSemana[i])} prendas estimadas`,
            valor: Math.round(totalPorSemana[i]),
          })),
          tabla: {
            encabezados: [
              'Sucursal',
              'Categoria',
              ...semanas.map(nombreDeSemana),
              'Stock disponible',
              'Reponer',
            ],
            filas: filas
              .map((f) => {
                const r = reposicion.get(`${f.sucursal}|${f.categoria}`);
                return [
                  f.sucursal,
                  f.categoria,
                  ...f.semanas.map((s) => Math.round(s.unidades)),
                  r?.stock_disponible ?? 0,
                  r?.sugerido ?? 0,
                ] as (string | number)[];
              })
              .sort(
                (a, b) => Number(b[b.length - 1]) - Number(a[a.length - 1]),
              ),
          },
          totales: {
            modelo: `Random Forest v${modelo.version}`,
            mae_prueba: modelo.metricas.mae,
            r2_prueba: modelo.metricas.r2,
            mejora_vs_referencia_pct: modelo.metricas.mejora_mae_pct,
          },
        };
      }

      case 'segmentos_clientes': {
        const modelo = await this.ml.exigirModelo('segmentos');
        type Segmento = {
          nombre: string;
          clientes: number;
          clientes_reales: number;
          recencia_promedio: number;
          frecuencia_promedio: number;
          monto_promedio: number;
          recomendacion: string;
        };
        const segmentos = modelo.resultados.segmentos as Segmento[];
        return {
          tipo,
          titulo: 'Segmentos de clientes',
          parametros,
          grafico: graficoDeParticipacion(segmentos.length),
          formato: 'entero',
          serie: segmentos.map((s) => ({
            etiqueta: s.nombre,
            detalle: `${s.clientes_reales} clientes reales`,
            valor: s.clientes,
          })),
          tabla: {
            encabezados: [
              'Segmento',
              'Clientes',
              'Clientes reales',
              'Dias desde la ultima compra',
              'Compras promedio',
              'Gasto promedio (Bs)',
              'Recomendacion',
            ],
            filas: segmentos.map((s) => [
              s.nombre,
              s.clientes,
              s.clientes_reales,
              s.recencia_promedio,
              s.frecuencia_promedio,
              bs(s.monto_promedio),
              s.recomendacion,
            ]),
          },
          totales: {
            modelo: `K-means v${modelo.version}`,
            k: modelo.metricas.k_elegido,
            silhouette: modelo.metricas.silhouette,
          },
        };
      }

      case 'ventas_por_semana':
      case 'ventas_por_mes': {
        const periodo: Periodo = tipo === 'ventas_por_mes' ? 'month' : 'week';
        const nombre = periodo === 'month' ? nombreDeMes : nombreDeSemana;
        const [resumen, filas] = await Promise.all([
          this.repo.resumenDeVentas(rango),
          this.repo.ventasPorPeriodo(rango, periodo),
        ]);
        return {
          tipo,
          titulo: periodo === 'month' ? 'Ventas por mes' : 'Ventas por semana',
          parametros,
          grafico: filas.length > 2 ? 'lineas' : 'barras',
          formato: 'bs',
          serie: filas.map((f) => ({
            etiqueta: nombre(String(f.periodo)),
            detalle: `${Number(f.ventas)} ventas, ${Number(f.unidades)} prendas`,
            valor: Number(f.importe),
          })),
          tabla: {
            encabezados: [
              periodo === 'month' ? 'Mes' : 'Semana (desde el lunes)',
              'Ventas',
              'Unidades',
              'Importe (Bs)',
            ],
            filas: filas.map((f) => [
              periodo === 'month'
                ? nombreDeMes(String(f.periodo))
                : String(f.periodo),
              Number(f.ventas),
              Number(f.unidades),
              bs(f.importe),
            ]),
          },
          totales: resumen[0] ?? {},
        };
      }

      case 'ventas_por_categoria': {
        const [resumen, filas] = await Promise.all([
          this.repo.resumenDeVentas(rango),
          this.repo.ventasPorCategoria(rango),
        ]);
        const total = filas.reduce((a, f) => a + Number(f.importe), 0);
        return {
          tipo,
          titulo: 'Ingresos por categoria',
          parametros,
          grafico: graficoDeParticipacion(filas.length),
          formato: 'bs',
          serie: filas.map((f) => ({
            etiqueta: String(f.categoria),
            detalle: `${Number(f.unidades)} prendas`,
            valor: Number(f.importe),
          })),
          tabla: {
            encabezados: [
              'Categoria',
              'Ventas',
              'Unidades',
              'Importe (Bs)',
              '% del total',
            ],
            filas: filas.map((f) => [
              String(f.categoria),
              Number(f.ventas),
              Number(f.unidades),
              bs(f.importe),
              total > 0
                ? ((Number(f.importe) / total) * 100).toFixed(1)
                : '0.0',
            ]),
          },
          totales: resumen[0] ?? {},
        };
      }

      case 'ventas_por_dia': {
        const [resumen, porDia] = await Promise.all([
          this.repo.resumenDeVentas(rango),
          this.repo.ventasPorDia(rango),
        ]);
        return {
          tipo,
          titulo: 'Ventas por dia',
          parametros,
          grafico: 'lineas',
          formato: 'bs',
          serie: porDia.map((f) => ({
            etiqueta: String(f.dia).slice(5),
            detalle: `${String(f.dia)}: ${Number(f.ventas)} ventas`,
            valor: Number(f.importe),
          })),
          tabla: {
            encabezados: ['Dia', 'Ventas', 'Importe (Bs)'],
            filas: porDia.map((f) => [
              String(f.dia),
              Number(f.ventas),
              bs(f.importe),
            ]),
          },
          totales: resumen[0] ?? {},
        };
      }

      case 'ventas_por_sucursal': {
        const [resumen, porSucursal] = await Promise.all([
          this.repo.resumenDeVentas(rango),
          this.repo.ventasPorSucursal(rango),
        ]);
        return {
          tipo,
          titulo: 'Ventas por sucursal',
          parametros,
          grafico: graficoDeParticipacion(porSucursal.length),
          formato: 'bs',
          serie: porSucursal.map((f) => ({
            etiqueta: String(f.sucursal),
            detalle: `${Number(f.ventas)} ventas`,
            valor: Number(f.importe),
          })),
          tabla: {
            encabezados: ['Sucursal', 'Ventas', 'Unidades', 'Importe (Bs)'],
            filas: porSucursal.map((f) => [
              String(f.sucursal),
              Number(f.ventas),
              Number(f.unidades),
              bs(f.importe),
            ]),
          },
          totales: resumen[0] ?? {},
        };
      }

      case 'top_productos': {
        const top = await this.repo.topProductos(rango, parametros.top ?? 10);
        return {
          tipo,
          titulo: 'Prendas mas vendidas',
          parametros,
          grafico: 'barras',
          formato: 'entero',
          serie: top.map((f) => ({
            etiqueta: String(f.producto),
            detalle: `Bs ${bs(f.importe)}`,
            valor: Number(f.unidades),
          })),
          tabla: {
            encabezados: ['Prenda', 'Categoria', 'Unidades', 'Importe (Bs)'],
            filas: top.map((f) => [
              String(f.producto),
              String(f.categoria),
              Number(f.unidades),
              bs(f.importe),
            ]),
          },
          totales: {
            prendas: top.length,
            unidades: top.reduce((a, f) => a + Number(f.unidades), 0),
          },
        };
      }

      case 'inventario_por_sucursal': {
        const filas = await this.repo.inventarioPorSucursal(
          parametros.sucursal_id,
        );
        const sumar = (campo: string) =>
          filas.reduce((a, f) => a + Number(f[campo]), 0);
        return {
          tipo,
          titulo: 'Inventario por sucursal',
          parametros,
          grafico: 'barras',
          formato: 'entero',
          serie: filas.map((f) => ({
            etiqueta: String(f.sucursal),
            detalle: `${Number(f.agotados)} agotados`,
            valor: Number(f.disponibles),
          })),
          tabla: {
            encabezados: [
              'Sucursal',
              'Unidades',
              'Reservadas',
              'Disponibles',
              'Agotados',
              'Valorizado (Bs)',
            ],
            filas: filas.map((f) => [
              String(f.sucursal),
              Number(f.unidades),
              Number(f.reservadas),
              Number(f.disponibles),
              Number(f.agotados),
              bs(f.valorizado),
            ]),
          },
          totales: {
            unidades: sumar('unidades'),
            disponibles: sumar('disponibles'),
            agotados: sumar('agotados'),
          },
        };
      }

      case 'por_reponer': {
        const umbral = parametros.umbral ?? 3;
        const filas = await this.repo.porReponer(
          parametros.sucursal_id,
          umbral,
        );
        return {
          tipo,
          titulo: umbral === 0 ? 'Prendas sin stock' : 'Prendas por reponer',
          parametros: { ...parametros, umbral },
          grafico: 'barras',
          formato: 'entero',
          serie: contarPor(filas, 'sucursal'),
          tabla: {
            encabezados: [
              'Prenda',
              'Sucursal',
              'Cantidad',
              'Reservadas',
              'Disponibles',
            ],
            filas: filas.map((f) => [
              String(f.producto),
              String(f.sucursal),
              Number(f.cantidad),
              Number(f.reservadas),
              Number(f.disponibles),
            ]),
          },
          totales: { lineas: filas.length, umbral, maximo_de_lineas: 50 },
        };
      }

      case 'reservas': {
        const filas = await this.repo.reservasDelRango(rango);
        const porEstado = Object.fromEntries(
          contarPor(filas, 'estado').map((e) => [e.etiqueta, e.valor]),
        );
        return {
          tipo,
          titulo: 'Reservas',
          parametros,
          grafico: 'barras',
          formato: 'entero',
          serie: contarPor(filas, 'sucursal'),
          tabla: {
            encabezados: [
              'Fecha',
              'Hora',
              'Cliente',
              'Sucursal',
              'Prendas',
              'Estado',
            ],
            filas: filas.map((f) => [
              String(f.fecha),
              String(f.hora),
              String(f.cliente),
              String(f.sucursal),
              Number(f.prendas),
              String(f.estado),
            ]),
          },
          totales: {
            reservas: filas.length,
            por_estado: porEstado,
            maximo_de_lineas: 200,
          },
        };
      }
    }
  }
}
