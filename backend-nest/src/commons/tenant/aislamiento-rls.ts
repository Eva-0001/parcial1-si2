import type { DataSource } from 'typeorm';
import { contextoActual } from './contexto-tenant.js';

/**
 * Rol sin privilegios de superusuario con el que se ejecutan las consultas de
 * la app. Hace falta porque un superusuario de PostgreSQL ignora RLS: el
 * backend se conecta con el usuario dueno de la base y, en cada conexion,
 * baja a este rol. Lo crea la migracion MultiEmpresa.
 *
 * DB_ROL_APP vacio desactiva el cambio de rol (para una base en la nube donde
 * el usuario de conexion ya no es superusuario: FORCE ROW LEVEL SECURITY lo
 * alcanza igual).
 */
export const ROL_APP = process.env.DB_ROL_APP ?? 'fs_app';

const FIJAR_CONTEXTO = `SELECT set_config('app.empresa_id', $1, false),
                               set_config('app.plataforma', $2, false)`;
const FIJAR_CONTEXTO_Y_ROL = `SELECT set_config('role', $3, false),
                                     set_config('app.empresa_id', $1, false),
                                     set_config('app.plataforma', $2, false)`;

interface ClientePg {
  query(sql: string, parametros?: unknown[]): Promise<unknown>;
}
type Liberar = (error?: unknown) => void;

/**
 * Engancha el driver de TypeORM: cada vez que se toma una conexion del pool
 * (consulta suelta o transaccion completa) se le copia el contexto de la
 * peticion actual. Se pisa siempre, para que una conexion reciclada nunca
 * arrastre la empresa de la peticion anterior.
 */
export function instalarAislamientoPorEmpresa(dataSource: DataSource): void {
  const driver = dataSource.driver as unknown as {
    obtainMasterConnection: () => Promise<[ClientePg, Liberar]>;
  };
  const original = driver.obtainMasterConnection.bind(driver);

  driver.obtainMasterConnection = async () => {
    // Se lee antes del await: es el contexto de quien pidio la conexion.
    const { empresaId, plataforma } = contextoActual();
    const [conexion, liberar] = await original();

    const parametros = [
      empresaId === null ? '' : String(empresaId),
      plataforma ? 'on' : 'off',
    ];
    try {
      if (ROL_APP) {
        await conexion.query(FIJAR_CONTEXTO_Y_ROL, [...parametros, ROL_APP]);
      } else {
        await conexion.query(FIJAR_CONTEXTO, parametros);
      }
    } catch (error) {
      liberar(error);
      throw error;
    }

    return [conexion, liberar];
  };
}
