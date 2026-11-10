/**
 * Consulta de ventas "a medida" para los reportes con IA.
 *
 * La IA NO escribe SQL: solo elige una dimension, una medida y filtros de
 * listas cerradas. Este modulo arma la consulta con fragmentos fijos de la
 * lista blanca de abajo, y todos los valores viajan como parametros ($1..$10).
 * Cualquier valor fuera de las listas se rechaza antes de llegar a la base.
 * El aislamiento por empresa lo sigue aplicando RLS en la conexion.
 */

/** Tablas que se pueden unir a la consulta (siempre por clave, nunca texto libre). */
const UNIONES = {
  modelo: 'JOIN modelos m ON m.id = p.modelo_id',
  categoria: 'LEFT JOIN categorias c ON c.id = p.categoria_id',
  color: 'LEFT JOIN colores co ON co.id = p.color_id',
  talla: 'LEFT JOIN talla t ON t.id = p.talla_id',
  temporada: 'LEFT JOIN temporadas tm ON tm.id = p.temporada_id',
  coleccion: 'LEFT JOIN colecciones col ON col.id = p.coleccion_id',
  proveedor: 'LEFT JOIN proveedores pr ON pr.id = p.proveedor_id',
  sucursal: 'JOIN sucursales s ON s.id = ps.sucursal_id',
  ciudad: 'LEFT JOIN ciudades ci ON ci.id = s.ciudad_id',
  cliente: 'LEFT JOIN usuarios u ON u.id = v.usuario_id',
} as const;
type Union = keyof typeof UNIONES;

interface Dimension {
  etiqueta: string;
  /** Expresion SQL de la etiqueta de cada fila. */
  expr: string;
  /** Expresion para ordenar cronologicamente (solo dimensiones de tiempo). */
  orden?: string;
  uniones: Union[];
}

export const DIMENSIONES = {
  categoria: {
    etiqueta: 'Categoria',
    expr: "COALESCE(c.nombre, 'Sin categoria')",
    uniones: ['categoria'],
  },
  prenda: { etiqueta: 'Prenda', expr: 'm.nombre', uniones: ['modelo'] },
  color: {
    etiqueta: 'Color',
    expr: "COALESCE(co.nombre, 'Sin color')",
    uniones: ['color'],
  },
  talla: {
    etiqueta: 'Talla',
    expr: "COALESCE(t.nombre, 'Sin talla')",
    uniones: ['talla'],
  },
  temporada: {
    etiqueta: 'Temporada',
    expr: "COALESCE(tm.nombre, 'Sin temporada')",
    uniones: ['temporada'],
  },
  coleccion: {
    etiqueta: 'Coleccion',
    expr: "COALESCE(col.nombre, 'Sin coleccion')",
    uniones: ['coleccion'],
  },
  proveedor: {
    etiqueta: 'Proveedor',
    expr: "COALESCE(pr.nombre, 'Sin proveedor')",
    uniones: ['proveedor'],
  },
  sucursal: { etiqueta: 'Sucursal', expr: 's.nombre', uniones: ['sucursal'] },
  ciudad: {
    etiqueta: 'Ciudad',
    expr: "COALESCE(ci.nombre, 'Sin ciudad')",
    uniones: ['sucursal', 'ciudad'],
  },
  cliente: {
    etiqueta: 'Cliente',
    expr: "COALESCE(NULLIF(TRIM(u.nombre || ' ' || u.apellido), ''), 'Sin cliente')",
    uniones: ['cliente'],
  },
  metodo_pago: {
    etiqueta: 'Forma de pago',
    expr: "COALESCE(v.metodo_pago::text, 'sin registrar')",
    uniones: [],
  },
  tipo_venta: {
    etiqueta: 'Tipo de venta',
    expr: 'v.tipo_venta::text',
    uniones: [],
  },
  modalidad: { etiqueta: 'Modalidad', expr: 'v.modalidad::text', uniones: [] },
  dia: {
    etiqueta: 'Dia',
    expr: "to_char(v.creada_en, 'YYYY-MM-DD')",
    orden: "to_char(v.creada_en, 'YYYY-MM-DD')",
    uniones: [],
  },
  semana: {
    etiqueta: 'Semana',
    expr: "to_char(date_trunc('week', v.creada_en), 'YYYY-MM-DD')",
    orden: "to_char(date_trunc('week', v.creada_en), 'YYYY-MM-DD')",
    uniones: [],
  },
  mes: {
    etiqueta: 'Mes',
    expr: "to_char(v.creada_en, 'YYYY-MM')",
    orden: "to_char(v.creada_en, 'YYYY-MM')",
    uniones: [],
  },
  dia_semana: {
    etiqueta: 'Dia de la semana',
    expr: "(ARRAY['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'])[EXTRACT(ISODOW FROM v.creada_en)::int]",
    orden: 'EXTRACT(ISODOW FROM v.creada_en)::int',
    uniones: [],
  },
  hora: {
    etiqueta: 'Hora',
    expr: "to_char(v.creada_en, 'HH24') || ':00'",
    orden: "to_char(v.creada_en, 'HH24')",
    uniones: [],
  },
} as const satisfies Record<string, Dimension>;
export type DimensionAMedida = keyof typeof DIMENSIONES;
export const LISTA_DIMENSIONES = Object.keys(DIMENSIONES) as DimensionAMedida[];

/** Columnas que se calculan siempre; `medida` elige cual va al grafico y al orden. */
export const MEDIDAS = {
  importe: {
    etiqueta: 'Importe (Bs)',
    expr: 'COALESCE(SUM(dv.cantidad * dv.precio), 0)::numeric(12,2)',
    formato: 'bs',
  },
  unidades: {
    etiqueta: 'Unidades',
    expr: 'COALESCE(SUM(dv.cantidad), 0)::int',
    formato: 'entero',
  },
  ventas: {
    etiqueta: 'Ventas',
    expr: 'COUNT(DISTINCT v.id)::int',
    formato: 'entero',
  },
  ticket_promedio: {
    etiqueta: 'Ticket promedio (Bs)',
    expr: 'ROUND(COALESCE(SUM(dv.cantidad * dv.precio), 0) / NULLIF(COUNT(DISTINCT v.id), 0), 2)',
    formato: 'bs',
  },
  clientes: {
    etiqueta: 'Clientes',
    expr: 'COUNT(DISTINCT v.usuario_id)::int',
    formato: 'entero',
  },
} as const;
export type MedidaAMedida = keyof typeof MEDIDAS;
export const LISTA_MEDIDAS = Object.keys(MEDIDAS) as MedidaAMedida[];

export const METODOS_PAGO = [
  'efectivo',
  'tarjeta',
  'qr',
  'contraentrega',
] as const;
export const TIPOS_VENTA = ['virtual', 'presencial'] as const;

export interface ConsultaAMedida {
  dimension: DimensionAMedida;
  medida: MedidaAMedida;
  /** Solo dimensiones que no son de tiempo; las de tiempo van en orden cronologico. */
  orden?: 'desc' | 'asc';
  limite?: number;
  desde?: string;
  hasta?: string;
  sucursal_id?: number;
  categoria_id?: number;
  modelo_id?: number;
  color_id?: number;
  talla_id?: number;
  temporada_id?: number;
  metodo_pago?: (typeof METODOS_PAGO)[number];
  tipo_venta?: (typeof TIPOS_VENTA)[number];
}

export class ConsultaInvalida extends Error {}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const idOpcional = (valor: unknown, campo: string): number | null => {
  if (valor === undefined || valor === null) return null;
  if (!Number.isInteger(valor) || (valor as number) < 1) {
    throw new ConsultaInvalida(`${campo} invalido`);
  }
  return valor as number;
};
const deLista = <T extends string>(
  valor: unknown,
  lista: readonly T[],
  campo: string,
): T | null => {
  if (valor === undefined || valor === null) return null;
  if (!lista.includes(valor as T))
    throw new ConsultaInvalida(`${campo} no permitido`);
  return valor as T;
};

const MAXIMO_FILAS = 400;

/** Arma el SQL y sus parametros. Lanza ConsultaInvalida si algo no esta en las listas. */
export function armarConsultaAMedida(consulta: ConsultaAMedida): {
  sql: string;
  parametros: unknown[];
} {
  const dimension = deLista(consulta.dimension, LISTA_DIMENSIONES, 'dimension');
  const medida = deLista(consulta.medida, LISTA_MEDIDAS, 'medida');
  if (!dimension || !medida)
    throw new ConsultaInvalida('Falta la dimension o la medida');
  const orden =
    deLista(consulta.orden, ['desc', 'asc'] as const, 'orden') ?? 'desc';
  for (const campo of ['desde', 'hasta'] as const) {
    const valor = consulta[campo];
    if (
      valor !== undefined &&
      valor !== null &&
      !(typeof valor === 'string' && FECHA.test(valor))
    ) {
      throw new ConsultaInvalida(`${campo} invalido`);
    }
  }
  const limite =
    consulta.limite === undefined
      ? MAXIMO_FILAS
      : Number.isInteger(consulta.limite) && consulta.limite >= 1
        ? Math.min(consulta.limite, MAXIMO_FILAS)
        : (() => {
            throw new ConsultaInvalida('limite invalido');
          })();

  const parametros = [
    consulta.desde ?? null,
    consulta.hasta ?? null,
    idOpcional(consulta.sucursal_id, 'sucursal_id'),
    idOpcional(consulta.categoria_id, 'categoria_id'),
    idOpcional(consulta.modelo_id, 'modelo_id'),
    idOpcional(consulta.color_id, 'color_id'),
    idOpcional(consulta.talla_id, 'talla_id'),
    idOpcional(consulta.temporada_id, 'temporada_id'),
    deLista(consulta.metodo_pago, METODOS_PAGO, 'metodo_pago'),
    deLista(consulta.tipo_venta, TIPOS_VENTA, 'tipo_venta'),
    limite,
  ];

  const dim: Dimension = DIMENSIONES[dimension];
  const uniones = [...new Set(dim.uniones)]
    .map((u) => UNIONES[u])
    .join('\n       ');
  const columnas = LISTA_MEDIDAS.map(
    (m) => `${MEDIDAS[m].expr} AS "${MEDIDAS[m].etiqueta}"`,
  ).join(',\n         ');
  const agrupar =
    dim.orden && dim.orden !== dim.expr
      ? `${dim.expr}, ${dim.orden}`
      : dim.expr;
  const ordenar = dim.orden
    ? `${dim.orden} ASC`
    : `${MEDIDAS[medida].expr} ${orden === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, 1`;

  const sql = `SELECT
         ${dim.expr} AS "${dim.etiqueta}",
         ${columnas}
       FROM ventas v
       JOIN detalle_venta dv ON dv.venta_id = v.id
       JOIN producto_sucursal ps ON ps.id = dv.producto_sucursal_id
       JOIN productos p ON p.id = ps.producto_id
       ${uniones}
       WHERE v.cancelada_en IS NULL
         AND ($1::date IS NULL OR v.creada_en >= $1::date)
         AND ($2::date IS NULL OR v.creada_en < $2::date + INTERVAL '1 day')
         AND ($3::int IS NULL OR ps.sucursal_id = $3::int)
         AND ($4::int IS NULL OR p.categoria_id = $4::int)
         AND ($5::int IS NULL OR p.modelo_id = $5::int)
         AND ($6::int IS NULL OR p.color_id = $6::int)
         AND ($7::int IS NULL OR p.talla_id = $7::int)
         AND ($8::int IS NULL OR p.temporada_id = $8::int)
         AND ($9::varchar IS NULL OR v.metodo_pago::text = $9::varchar)
         AND ($10::varchar IS NULL OR v.tipo_venta::text = $10::varchar)
       GROUP BY ${agrupar}
       ORDER BY ${ordenar}
       LIMIT $11::int`;
  return { sql, parametros };
}

export const esDimensionDeTiempo = (dimension: DimensionAMedida) =>
  'orden' in DIMENSIONES[dimension];
