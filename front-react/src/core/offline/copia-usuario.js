import { useAuthStore } from '../stores/auth.store'
import { tiendaActual } from '../stores/tienda.store'
import { ALMACEN_RESPUESTAS, idb } from './idb'

/**
 * Copia local de listas privadas del usuario (sus reservas, sus pedidos) para mostrarlas
 * sin conexión. A diferencia del catálogo, son datos personales: la clave lleva el id del
 * usuario y se borran al cerrar sesión (ver borrarCopiasDeUsuario).
 */
export const PREFIJO_COPIA_USUARIO = 'usuario:'

function claveDe(nombre) {
  const id = useAuthStore.getState().usuario?.id
  return id ? `${PREFIJO_COPIA_USUARIO}${id}|${tiendaActual()}|${nombre}` : null
}

export async function guardarCopiaUsuario(nombre, datos) {
  const clave = claveDe(nombre)
  if (!clave) return
  try {
    await idb.guardar(ALMACEN_RESPUESTAS, { clave, datos, guardado_en: new Date().toISOString() })
  } catch {
    // Sin espacio o IndexedDB bloqueado: solo se pierde la vista sin conexión.
  }
}

/** { datos, guardado_en } o null si nunca se guardó. */
export async function copiaUsuario(nombre) {
  const clave = claveDe(nombre)
  if (!clave) return null
  try {
    return (await idb.obtener(ALMACEN_RESPUESTAS, clave)) ?? null
  } catch {
    return null
  }
}
