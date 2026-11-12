import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { kmeans } from 'ml-kmeans';
import { RandomForestRegression } from 'ml-random-forest';
import {
  ajustarEscalador,
  aleatorio,
  cuartiles,
  desescalar,
  escalar,
  inercia,
  mae,
  masCercano,
  media,
  normal,
  r2,
  redondear,
  rmse,
  silhouette,
} from '../commons/ml/estadistica.js';
import { empresaActualId } from '../commons/tenant/contexto-tenant.js';
import {
  type ClienteRfm,
  type FilaDemanda,
  MlRepository,
  type ModeloGuardado,
} from '../repositories/ml.repository.js';

/**
 * Filas sinteticas de demanda semanal por empresa. Las semanas de historial
 * se calculan a partir de este total: ceil(5000 / (sucursales x categorias)).
 */
const FILAS_DEMANDA_SINTETICAS = 5000;
/** Ultimas semanas que se reservan para evaluar (no se usan para entrenar). */
const SEMANAS_DE_PRUEBA = 12;
const SEMANAS_A_PREDECIR = 4;
const CLIENTES_SINTETICOS = 5000;
const DIA_MS = 24 * 60 * 60 * 1000;

const PARAMETROS_BOSQUE = {
  nEstimators: 20,
  maxFeatures: 0.6,
  replacement: true,
  seed: 42,
  noOOB: true,
  useSampleBagging: true,
  treeOptions: { maxDepth: 8, minNumSamples: 3 },
};

/** Perfiles de compra de los clientes sinteticos: [recencia, frecuencia, ticket] (min, max). */
const PERFILES = [
  { perfil: 'vip', peso: 0.12, recencia: [2, 25], frecuencia: [12, 30], ticket: [250, 600] },
  { perfil: 'frecuente', peso: 0.28, recencia: [5, 45], frecuencia: [5, 12], ticket: [150, 350] },
  { perfil: 'en_riesgo', peso: 0.25, recencia: [100, 320], frecuencia: [3, 9], ticket: [150, 400] },
  { perfil: 'ocasional', peso: 0.35, recencia: [1, 90], frecuencia: [1, 2], ticket: [80, 250] },
] as const;

const RECOMENDACIONES: Record<string, string> = {
  'Clientes VIP': 'Fidelizar: preventa de colecciones, atención personalizada y beneficios exclusivos.',
  Frecuentes: 'Aumentar el ticket: combos y recomendaciones de prendas complementarias.',
  Regulares: 'Mantener el contacto: avisos de nuevos ingresos y promociones por temporada.',
  'En riesgo de perderse': 'Recuperar: cupón de regreso con vencimiento corto y encuesta de satisfacción.',
  'Nuevos u ocasionales': 'Convertir en recurrentes: descuento en la segunda compra y registro en la app.',
};

/** Columnas del modelo de demanda, para explicar la importancia de cada variable. */
const VARIABLES = [
  'Semana del año (sen)',
  'Semana del año (cos)',
  'Mes',
  'Promoción activa',
  'Diciembre (fiestas)',
  'Ventas de la semana anterior',
  'Ventas hace 2 semanas',
  'Ventas hace 4 semanas',
  'Promedio de las últimas 4 semanas',
];

const lunesDe = (fecha: Date) => {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);
const entre = (rng: () => number, [a, b]: readonly [number, number]) => a + rng() * (b - a);

interface Serie {
  sucursal_id: number;
  categoria_id: number;
  semanas: string[];
  unidades: number[];
  promociones: boolean[];
}

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(private readonly repo: MlRepository) {}

  // ======================================================= datos sinteticos

  /**
   * Genera exactamente FILAS_DEMANDA_SINTETICAS filas de demanda semanal por
   * sucursal y categoria con patrones realistas (temporada, fiestas, inicio
   * de mes, promociones, tendencia y ruido) y le suma las ventas reales del
   * sistema. Tambien genera CLIENTES_SINTETICOS clientes con cuatro perfiles
   * de compra para la segmentacion.
   */
  async generarDatos() {
    const empresaId = empresaActualId();
    const rng = aleatorio(20261108 + empresaId * 7919);
    const [sucursales, categorias] = await Promise.all([this.repo.sucursales(), this.repo.categorias()]);
    if (sucursales.length === 0 || categorias.length === 0) {
      throw new UnprocessableEntityException(
        'La empresa necesita al menos una sucursal y una categoria para generar datos de entrenamiento',
      );
    }

    const totalReal = categorias.reduce((s, c) => s + c.unidades, 0);
    const actual = lunesDe(new Date());
    const filas: FilaDemanda[] = [];

    // Semanas por serie para llegar al total; las primeras `sobrantes` series
    // llevan una semana menos (la mas antigua) para que el total sea exacto.
    const nSeries = sucursales.length * categorias.length;
    const semanasPorSerie = Math.ceil(FILAS_DEMANDA_SINTETICAS / nSeries);
    const sobrantes = semanasPorSerie * nSeries - FILAS_DEMANDA_SINTETICAS;
    let indiceSerie = 0;

    for (const sucursal of sucursales) {
      const tamano = 0.7 + 0.7 * rng();
      for (const categoria of categorias) {
        const semanasSerie = semanasPorSerie - (indiceSerie++ < sobrantes ? 1 : 0);
        const popularidad =
          totalReal > 0
            ? Math.min(2.5, Math.max(0.3, (categoria.unidades / totalReal) * categorias.length))
            : 0.6 + 0.8 * rng();
        const nombre = categoria.nombre.toLowerCase();
        const temporada = /chaquet|buzo|abrig|chompa|campera|sueter|su[eé]ter/.test(nombre)
          ? 'invierno'
          : /polera|vestido|short|falda|bermuda/.test(nombre)
            ? 'verano'
            : 'neutra';
        const base = 12 * tamano * popularidad;

        for (let i = semanasSerie; i >= 1; i--) {
          const semana = sumarDias(actual, -7 * i);
          const diaDelAnio = (semana.getTime() - Date.UTC(semana.getUTCFullYear(), 0, 1)) / DIA_MS;
          const ciclo = (pico: number) => Math.cos((2 * Math.PI * (diaDelAnio - pico)) / 365);

          let lambda = base;
          if (temporada === 'invierno') lambda *= 1 + 0.45 * ciclo(196); // pico a mediados de julio
          else if (temporada === 'verano') lambda *= 1 + 0.4 * ciclo(15); // pico a mediados de enero
          else lambda *= 1 + 0.1 * ciclo(350);
          if (semana.getUTCMonth() === 11) lambda *= 1.4; // fiestas
          if (semana.getUTCDate() <= 7) lambda *= 1.2; // semana de cobro de sueldos
          const promocion = rng() < 0.15;
          if (promocion) lambda *= 1.5;
          lambda *= 1 + 0.004 * (semanasPorSerie - i); // crecimiento del negocio
          lambda *= 1 + 0.1 * normal(rng); // ruido

          const unidades = Math.max(0, Math.round(lambda));
          filas.push({
            semana: iso(semana),
            sucursal_id: sucursal.id,
            categoria_id: categoria.id,
            unidades,
            importe: redondear(unidades * categoria.precio * (promocion ? 0.85 : 1)),
            promocion,
          });
        }
      }
    }

    const clientes = Array.from({ length: CLIENTES_SINTETICOS }, (_, i) => {
      let suerte = rng();
      const perfil = PERFILES.find((p) => (suerte -= p.peso) < 0) ?? PERFILES[PERFILES.length - 1];
      const frecuencia = Math.round(entre(rng, perfil.frecuencia));
      return {
        codigo: `SINT-${String(i + 1).padStart(4, '0')}`,
        perfil: perfil.perfil,
        recencia_dias: Math.round(entre(rng, perfil.recencia)),
        frecuencia,
        monto: redondear(frecuencia * entre(rng, perfil.ticket)),
      };
    });

    await this.repo.borrarDatos();
    await this.repo.insertarDemanda(filas);
    const semanasReales = await this.repo.sumarVentasReales();
    await this.repo.insertarClientes(clientes);
    this.logger.log(
      `Empresa ${empresaId}: ${filas.length} filas sinteticas, ${semanasReales} con ventas reales, ${clientes.length} clientes`,
    );
    return this.repo.resumenDatos();
  }

  // ===================================================== modelo de demanda

  /**
   * Random Forest de regresion: predice las unidades que vendera cada
   * categoria en cada sucursal la proxima semana. Se evalua con las ultimas
   * 12 semanas (separacion temporal: nunca se entrena con el futuro) y se
   * compara contra una referencia simple (promedio de las ultimas 4 semanas).
   */
  async entrenarDemanda(): Promise<ModeloGuardado> {
    const filas = await this.repo.demanda();
    if (filas.length === 0) {
      throw new UnprocessableEntityException('No hay datos: genera los datos sinteticos primero');
    }
    const [sucursales, categorias] = await Promise.all([this.repo.sucursales(), this.repo.categorias()]);
    const indiceSucursal = new Map(sucursales.map((s, i) => [s.id, i]));
    const indiceCategoria = new Map(categorias.map((c, i) => [c.id, i]));

    const series = this.agruparSeries(filas);
    const semanas = [...new Set(filas.map((f) => f.semana))].sort();
    const corte = semanas[Math.max(0, semanas.length - SEMANAS_DE_PRUEBA)];

    const variables = (serie: Serie, t: number, historial: number[], semana: string, promo: boolean) => {
      const fecha = new Date(`${semana}T00:00:00Z`);
      const diaDelAnio = (fecha.getTime() - Date.UTC(fecha.getUTCFullYear(), 0, 1)) / DIA_MS;
      const angulo = (2 * Math.PI * diaDelAnio) / 365;
      const sucursal = Array.from({ length: sucursales.length }, () => 0);
      const categoria = Array.from({ length: categorias.length }, () => 0);
      sucursal[indiceSucursal.get(serie.sucursal_id) ?? 0] = 1;
      categoria[indiceCategoria.get(serie.categoria_id) ?? 0] = 1;
      return [
        Math.sin(angulo),
        Math.cos(angulo),
        fecha.getUTCMonth() + 1,
        promo ? 1 : 0,
        fecha.getUTCMonth() === 11 ? 1 : 0,
        historial[t - 1],
        historial[t - 2],
        historial[t - 4],
        media(historial.slice(t - 4, t)),
        ...sucursal,
        ...categoria,
      ];
    };

    const entrenamiento: { x: number[]; y: number }[] = [];
    const prueba: { x: number[]; y: number; base: number; semana: string }[] = [];
    for (const serie of series) {
      for (let t = 4; t < serie.unidades.length; t++) {
        const x = variables(serie, t, serie.unidades, serie.semanas[t], serie.promociones[t]);
        const y = serie.unidades[t];
        if (serie.semanas[t] < corte) entrenamiento.push({ x, y });
        else prueba.push({ x, y, base: media(serie.unidades.slice(t - 4, t)), semana: serie.semanas[t] });
      }
    }

    const inicio = Date.now();
    const bosque = new RandomForestRegression(PARAMETROS_BOSQUE as never);
    bosque.train(
      entrenamiento.map((e) => e.x),
      entrenamiento.map((e) => e.y),
    );
    const predichos = bosque.predict(prueba.map((p) => p.x));
    const reales = prueba.map((p) => p.y);
    const referencia = prueba.map((p) => p.base);

    const metricas = {
      mae: redondear(mae(reales, predichos)),
      rmse: redondear(rmse(reales, predichos)),
      r2: redondear(r2(reales, predichos), 3),
      referencia_mae: redondear(mae(reales, referencia)),
      referencia_rmse: redondear(rmse(reales, referencia)),
      referencia_r2: redondear(r2(reales, referencia), 3),
      mejora_mae_pct: redondear((1 - mae(reales, predichos) / Math.max(mae(reales, referencia), 1e-9)) * 100, 1),
      unidades_promedio: redondear(media(reales)),
      segundos_entrenamiento: redondear((Date.now() - inicio) / 1000, 1),
    };

    // Real vs predicho de la etapa de prueba, sumado por semana (para el grafico).
    const porSemana = new Map<string, { real: number; predicho: number }>();
    prueba.forEach((p, i) => {
      const acc = porSemana.get(p.semana) ?? { real: 0, predicho: 0 };
      acc.real += p.y;
      acc.predicho += predichos[i];
      porSemana.set(p.semana, acc);
    });

    const importancia = this.importancia(bosque, sucursales.length, categorias.length);

    // El mismo modelo evaluado pronostica las proximas semanas: sus variables
    // (ventas de las semanas anteriores) ya incluyen el periodo de prueba.
    // No se reentrena con todo para no bloquear el servidor (ml-random-forest
    // corre en el hilo principal).
    const { pronostico, reposicion, totales } = await this.pronosticar(
      bosque,
      series,
      variables,
      sucursales,
      categorias,
    );

    return this.repo.guardarModelo({
      tipo: 'demanda',
      algoritmo: 'Random Forest (regresión)',
      filas_entrenamiento: entrenamiento.length,
      filas_prueba: prueba.length,
      parametros: {
        ...PARAMETROS_BOSQUE,
        variables: [...VARIABLES, 'Sucursal (one-hot)', 'Categoría (one-hot)'],
        objetivo: 'Unidades vendidas por categoría y sucursal en la semana',
        corte_prueba: corte,
        semanas_prueba: SEMANAS_DE_PRUEBA,
      },
      metricas,
      resultados: {
        prueba: [...porSemana].map(([semana, v]) => ({
          semana,
          real: v.real,
          predicho: redondear(v.predicho, 1),
        })),
        historial: semanas.slice(-SEMANAS_DE_PRUEBA).map((semana) => ({
          semana,
          real: filas.filter((f) => f.semana === semana).reduce((s, f) => s + f.unidades, 0),
        })),
        pronostico_total: totales,
        pronostico,
        reposicion,
        importancia,
      },
    });
  }

  private agruparSeries(filas: FilaDemanda[]): Serie[] {
    const mapa = new Map<string, Serie>();
    for (const f of filas) {
      const clave = `${f.sucursal_id}-${f.categoria_id}`;
      let serie = mapa.get(clave);
      if (!serie) {
        serie = { sucursal_id: f.sucursal_id, categoria_id: f.categoria_id, semanas: [], unidades: [], promociones: [] };
        mapa.set(clave, serie);
      }
      serie.semanas.push(f.semana);
      serie.unidades.push(f.unidades);
      serie.promociones.push(f.promocion);
    }
    return [...mapa.values()].filter((s) => s.unidades.length > 8);
  }

  /** Importancia de cada variable (%), juntando las columnas one-hot. */
  private importancia(bosque: RandomForestRegression, nSucursales: number, nCategorias: number) {
    const valores = (bosque as unknown as { featureImportance(): number[] }).featureImportance();
    const fijas = VARIABLES.length;
    const grupos = [
      ...VARIABLES.map((v, i) => ({ variable: v, valor: valores[i] ?? 0 })),
      { variable: 'Sucursal', valor: valores.slice(fijas, fijas + nSucursales).reduce((a, b) => a + b, 0) },
      {
        variable: 'Categoría',
        valor: valores.slice(fijas + nSucursales, fijas + nSucursales + nCategorias).reduce((a, b) => a + b, 0),
      },
    ];
    const total = grupos.reduce((s, g) => s + g.valor, 0) || 1;
    return grupos
      .map((g) => ({ variable: g.variable, porcentaje: redondear((g.valor / total) * 100, 1) }))
      .sort((a, b) => b.porcentaje - a.porcentaje);
  }

  /**
   * Pronostico recursivo de las proximas 4 semanas para cada serie (cada
   * semana predicha alimenta las variables de la siguiente). Usa las
   * promociones cargadas en el sistema y el stock real para sugerir reposicion.
   */
  private async pronosticar(
    modelo: RandomForestRegression,
    series: Serie[],
    variables: (s: Serie, t: number, h: number[], semana: string, promo: boolean) => number[],
    sucursales: { id: number; nombre: string }[],
    categorias: { id: number; nombre: string }[],
  ) {
    const [promociones, stock] = await Promise.all([this.repo.promociones(), this.repo.stockPorCategoria()]);
    const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));
    const nombreCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));
    const disponible = new Map(stock.map((s) => [`${s.sucursal_id}-${s.categoria_id}`, s.disponible]));
    const actual = lunesDe(new Date());

    const pronostico = [];
    const totales = new Map<string, number>();
    for (const serie of series) {
      const historial = [...serie.unidades];
      const semanas: { semana: string; unidades: number }[] = [];
      for (let h = 0; h < SEMANAS_A_PREDECIR; h++) {
        const semana = iso(sumarDias(actual, 7 * h));
        const fin = iso(sumarDias(actual, 7 * h + 6));
        const promo = promociones.some(
          (p) => p.sucursal_id === serie.sucursal_id && p.desde <= fin && p.hasta >= semana,
        );
        const [valor] = modelo.predict([variables(serie, historial.length, historial, semana, promo)]);
        const unidades = Math.max(0, valor);
        historial.push(unidades);
        semanas.push({ semana, unidades: redondear(unidades, 1) });
        totales.set(semana, (totales.get(semana) ?? 0) + unidades);
      }
      pronostico.push({
        sucursal_id: serie.sucursal_id,
        sucursal: nombreSucursal.get(serie.sucursal_id) ?? `#${serie.sucursal_id}`,
        categoria_id: serie.categoria_id,
        categoria: nombreCategoria.get(serie.categoria_id) ?? `#${serie.categoria_id}`,
        semanas,
      });
    }

    // Reposicion: lo que se espera vender en 2 semanas contra lo que hay hoy.
    // Solo las categorias que la sucursal tiene en su catalogo.
    const reposicion = pronostico
      .filter((p) => disponible.has(`${p.sucursal_id}-${p.categoria_id}`))
      .map((p) => {
        const demanda2 = p.semanas[0].unidades + p.semanas[1].unidades;
        const stockHoy = disponible.get(`${p.sucursal_id}-${p.categoria_id}`) ?? 0;
        return {
          sucursal: p.sucursal,
          categoria: p.categoria,
          demanda_2_semanas: Math.round(demanda2),
          stock_disponible: stockHoy,
          sugerido: Math.max(0, Math.ceil(demanda2 - stockHoy)),
          cobertura_semanas: p.semanas[0].unidades > 0 ? redondear(stockHoy / p.semanas[0].unidades, 1) : null,
        };
      })
      .sort((a, b) => b.sugerido - a.sugerido);

    return {
      pronostico,
      reposicion,
      totales: [...totales].map(([semana, unidades]) => ({ semana, unidades: redondear(unidades, 1) })),
    };
  }

  // ============================================= segmentacion de clientes

  /**
   * K-means sobre recencia, frecuencia y monto (RFM, en escala logaritmica y
   * estandarizados). Se prueba k = 2..6 y se elige el de mayor silhouette.
   * Cada grupo recibe un nombre segun su centroide y los clientes reales se
   * asignan al grupo mas cercano.
   */
  async entrenarSegmentos(): Promise<ModeloGuardado> {
    const [sinteticos, reales] = await Promise.all([this.repo.clientesSinteticos(), this.repo.clientesReales()]);
    const todos: ClienteRfm[] = [...sinteticos, ...reales];
    if (todos.length < 10) {
      throw new UnprocessableEntityException('No hay clientes suficientes: genera los datos sinteticos primero');
    }

    const crudo = (c: ClienteRfm) => [Math.log1p(c.recencia_dias), Math.log1p(c.frecuencia), Math.log1p(c.monto)];
    const escalador = ajustarEscalador(todos.map(crudo));
    const puntos = todos.map((c) => escalar(crudo(c), escalador));

    const curva: { k: number; silhouette: number; inercia: number }[] = [];
    let mejor: { k: number; silhouette: number; clusters: number[]; centroides: number[][] } | null = null;
    for (let k = 2; k <= 6; k++) {
      const r = kmeans(puntos, k, { seed: 42, initialization: 'kmeans++' });
      const s = silhouette(puntos, r.clusters);
      curva.push({ k, silhouette: redondear(s, 3), inercia: redondear(inercia(puntos, r.clusters, r.centroids), 1) });
      if (!mejor || s > mejor.silhouette) mejor = { k, silhouette: s, clusters: r.clusters, centroides: r.centroids };
    }
    if (!mejor) throw new UnprocessableEntityException('No se pudo agrupar a los clientes');

    // Centroides en unidades originales (dias, compras, Bs) para nombrarlos.
    const centros = mejor.centroides.map((c) => {
      const [r, f, m] = desescalar(c, escalador).map((v) => Math.expm1(v));
      return { recencia: r, frecuencia: f, monto: m };
    });
    const nombres = this.nombrarGrupos(centros);

    const segmentos = centros.map((c, g) => {
      const miembros = todos.filter((_, i) => mejor.clusters[i] === g);
      return {
        grupo: g,
        nombre: nombres[g],
        clientes: miembros.length,
        clientes_reales: miembros.filter((m) => m.id !== null).length,
        recencia_promedio: Math.round(media(miembros.map((m) => m.recencia_dias))),
        frecuencia_promedio: redondear(media(miembros.map((m) => m.frecuencia)), 1),
        monto_promedio: redondear(media(miembros.map((m) => m.monto))),
        recomendacion: RECOMENDACIONES[nombres[g]] ?? '',
      };
    });

    const clientesReales = reales
      .map((c) => {
        const g = masCercano(escalar(crudo(c), escalador), mejor.centroides);
        return {
          id: c.id,
          nombre: c.nombre,
          segmento: nombres[g],
          recencia_dias: c.recencia_dias,
          frecuencia: c.frecuencia,
          monto: redondear(c.monto),
        };
      })
      .sort((a, b) => b.monto - a.monto);

    return this.repo.guardarModelo({
      tipo: 'segmentos',
      algoritmo: 'K-means (RFM)',
      filas_entrenamiento: todos.length,
      filas_prueba: 0,
      parametros: {
        variables: ['Recencia (días, log)', 'Frecuencia (compras, log)', 'Monto (Bs, log)'],
        estandarizacion: 'z-score',
        k_probados: [2, 3, 4, 5, 6],
        inicializacion: 'k-means++',
        seed: 42,
      },
      metricas: {
        k_elegido: mejor.k,
        silhouette: redondear(mejor.silhouette, 3),
        clientes_sinteticos: sinteticos.length,
        clientes_reales: reales.length,
      },
      resultados: { curva, segmentos, clientes_reales: clientesReales },
    });
  }

  /** Nombra cada grupo por su centroide: mayor monto = VIP, mayor recencia = en riesgo, etc. */
  private nombrarGrupos(centros: { recencia: number; frecuencia: number; monto: number }[]): string[] {
    const nombres = Array.from({ length: centros.length }, () => '');
    const libres = () => centros.map((_, i) => i).filter((i) => !nombres[i]);
    const elegir = (orden: (a: number, b: number) => number) => libres().sort(orden)[0];

    nombres[elegir((a, b) => centros[b].monto - centros[a].monto)] = 'Clientes VIP';
    if (libres().length > 0) {
      const riesgo = elegir((a, b) => centros[b].recencia - centros[a].recencia);
      if (centros[riesgo].recencia > 60) nombres[riesgo] = 'En riesgo de perderse';
    }
    if (libres().length > 0) {
      nombres[elegir((a, b) => centros[a].frecuencia - centros[b].frecuencia)] = 'Nuevos u ocasionales';
    }
    const resto = libres().sort((a, b) => centros[b].monto - centros[a].monto);
    resto.forEach((i, n) => {
      nombres[i] = n === 0 ? 'Frecuentes' : n === 1 ? 'Regulares' : `Grupo ${i + 1}`;
    });
    return nombres;
  }

  // ======================================================== anomalias

  /**
   * Ventas con montos atipicos (regla de Tukey: mas de 3 rangos
   * intercuartilicos sobre el tercer cuartil o bajo el primero).
   */
  async anomalias() {
    const ventas = await this.repo.ventasRecientes();
    if (ventas.length < 8) return { metodo: 'Tukey (3 × IQR)', limite_superior: null, ventas: [] };
    const { q1, q3 } = cuartiles(ventas.map((v) => v.total));
    const iqr = q3 - q1;
    const superior = q3 + 3 * iqr;
    const inferior = Math.max(0, q1 - 3 * iqr);
    return {
      metodo: 'Tukey (3 × IQR)',
      limite_superior: redondear(superior),
      limite_inferior: redondear(inferior),
      ventas: ventas
        .filter((v) => v.total > superior || v.total < inferior)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15),
    };
  }

  // ======================================================== orquestacion

  async entrenar(regenerar = false) {
    const datos = await this.repo.resumenDatos();
    if (regenerar || Number(datos.filas) === 0) await this.generarDatos();
    await this.entrenarDemanda();
    await this.entrenarSegmentos();
    return this.resumen();
  }

  async resumen() {
    const [datos, demanda, segmentos, anomalias, historial] = await Promise.all([
      this.repo.resumenDatos(),
      this.repo.ultimoModelo('demanda'),
      this.repo.ultimoModelo('segmentos'),
      this.anomalias(),
      this.repo.historial(),
    ]);
    return { datos, demanda, segmentos, anomalias, historial };
  }

  /** Modelo vigente o error claro si todavia no se entreno. */
  async exigirModelo(tipo: 'demanda' | 'segmentos'): Promise<ModeloGuardado> {
    const modelo = await this.repo.ultimoModelo(tipo);
    if (!modelo) {
      throw new UnprocessableEntityException(
        'Todavia no se entrenaron los modelos: entra a Analitica inteligente y pulsa "Entrenar modelos"',
      );
    }
    return modelo;
  }
}
