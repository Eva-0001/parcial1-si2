/**
 * Funciones numericas del modulo de analitica: generador aleatorio con
 * semilla, metricas de evaluacion y preprocesamiento. Las librerias de ML de
 * JavaScript traen los modelos pero no las metricas; se calculan aca.
 */

/** Generador pseudoaleatorio determinista (mulberry32). */
export function aleatorio(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estandar (Box-Muller) a partir de un generador uniforme. */
export function normal(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const media = (xs: number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

export function desvio(xs: number[]): number {
  const m = media(xs);
  return Math.sqrt(media(xs.map((x) => (x - m) ** 2)));
}

// ------------------------------------------------- metricas de regresion

/** Error absoluto medio. */
export function mae(reales: number[], predichos: number[]): number {
  return media(reales.map((r, i) => Math.abs(r - predichos[i])));
}

/** Raiz del error cuadratico medio. */
export function rmse(reales: number[], predichos: number[]): number {
  return Math.sqrt(media(reales.map((r, i) => (r - predichos[i]) ** 2)));
}

/** Coeficiente de determinacion. 1 = perfecto, 0 = igual que predecir la media. */
export function r2(reales: number[], predichos: number[]): number {
  const m = media(reales);
  const total = reales.reduce((a, r) => a + (r - m) ** 2, 0);
  const residuo = reales.reduce((a, r, i) => a + (r - predichos[i]) ** 2, 0);
  return total === 0 ? 0 : 1 - residuo / total;
}

// ------------------------------------------------------ preprocesamiento

export interface Escalador {
  medias: number[];
  desvios: number[];
}

/** Estandarizacion z-score por columna (media 0, desvio 1). */
export function ajustarEscalador(filas: number[][]): Escalador {
  const columnas = filas[0]?.length ?? 0;
  const medias: number[] = [];
  const desvios: number[] = [];
  for (let j = 0; j < columnas; j++) {
    const col = filas.map((f) => f[j]);
    medias.push(media(col));
    desvios.push(desvio(col) || 1);
  }
  return { medias, desvios };
}

export const escalar = (fila: number[], e: Escalador) =>
  fila.map((x, j) => (x - e.medias[j]) / e.desvios[j]);

export const desescalar = (fila: number[], e: Escalador) =>
  fila.map((x, j) => x * e.desvios[j] + e.medias[j]);

// ------------------------------------------------------------- clustering

const distancia = (a: number[], b: number[]) =>
  Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

/**
 * Coeficiente silhouette medio (-1 a 1): que tan bien separado esta cada punto
 * de los otros grupos respecto de su propio grupo. Mayor es mejor.
 */
export function silhouette(puntos: number[][], grupos: number[]): number {
  const k = Math.max(...grupos) + 1;
  if (k < 2) return 0;
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const sumas = Array.from({ length: k }, () => 0);
    const cuentas = Array.from({ length: k }, () => 0);
    for (let j = 0; j < puntos.length; j++) {
      if (i === j) continue;
      sumas[grupos[j]] += distancia(puntos[i], puntos[j]);
      cuentas[grupos[j]]++;
    }
    const propio = grupos[i];
    if (cuentas[propio] === 0) continue;
    const a = sumas[propio] / cuentas[propio];
    let b = Infinity;
    for (let g = 0; g < k; g++) {
      if (g !== propio && cuentas[g] > 0) b = Math.min(b, sumas[g] / cuentas[g]);
    }
    suma += (b - a) / Math.max(a, b);
  }
  return suma / puntos.length;
}

/** Suma de distancias al cuadrado de cada punto a su centroide (metodo del codo). */
export function inercia(puntos: number[][], grupos: number[], centroides: number[][]): number {
  return puntos.reduce((s, p, i) => s + distancia(p, centroides[grupos[i]]) ** 2, 0);
}

export function masCercano(punto: number[], centroides: number[][]): number {
  let mejor = 0;
  let menor = Infinity;
  centroides.forEach((c, i) => {
    const d = distancia(punto, c);
    if (d < menor) {
      menor = d;
      mejor = i;
    }
  });
  return mejor;
}

export function cuartiles(xs: number[]): { q1: number; q3: number } {
  const o = [...xs].sort((a, b) => a - b);
  const en = (p: number) => {
    const pos = (o.length - 1) * p;
    const base = Math.floor(pos);
    const resto = pos - base;
    return o[base] + (o[base + 1] !== undefined ? resto * (o[base + 1] - o[base]) : 0);
  };
  return { q1: en(0.25), q3: en(0.75) };
}

export const redondear = (x: number, decimales = 2) => {
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
};
