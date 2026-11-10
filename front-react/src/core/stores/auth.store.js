import { create } from 'zustand'
import { ALMACEN_RESPUESTAS, idb } from '../offline/idb'

export const TOKEN_KEY = 'token'
export const USER_KEY = 'usuario'
export const EMPRESA_KEY = 'empresa'

export const useAuthStore = create((set, get) => ({
  usuario: leerUsuarioGuardado(),

  /** Empresa del usuario ({ id, nombre, slug }); null para el superadmin. */
  empresa: leerJson(EMPRESA_KEY),

  sesionExpirada: false,

  guardarSesion(res) {
    localStorage.setItem(TOKEN_KEY, res.access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(res.usuario))
    localStorage.setItem(EMPRESA_KEY, JSON.stringify(res.empresa ?? null))
    set({ usuario: res.usuario, empresa: res.empresa ?? null, sesionExpirada: false })
  },

  logout() {
    borrarCopiasDeUsuario()
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(EMPRESA_KEY)
    set({ usuario: null, empresa: null })
  },

  expirarSesion() {
    if (get().usuario === null) return
    get().logout()
    set({ sesionExpirada: true })
  },

  cerrarAvisoSesion() {
    set({ sesionExpirada: false })
  },

  actualizarUsuario(cambios) {
    const actual = get().usuario
    if (!actual) return

    const fusion = { ...actual, ...cambios, rol: cambios.rol ?? actual.rol }
    localStorage.setItem(USER_KEY, JSON.stringify(fusion))
    set({ usuario: fusion })
  },
}))

/** Las copias offline de reservas y pedidos son personales: no quedan en el equipo tras cerrar sesión. */
function borrarCopiasDeUsuario() {
  idb
    .claves(ALMACEN_RESPUESTAS)
    .then((claves) =>
      Promise.all(
        claves.filter((c) => String(c).startsWith('usuario:')).map((c) => idb.borrar(ALMACEN_RESPUESTAS, c)),
      ),
    )
    .catch(() => {})
}

export function obtenerToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function rutaInicioDe(rol) {
  switch (rol) {
    case 'superadmin':
      return '/plataforma'
    case 'administrador':
      return '/panel'
    case 'encargado':
      return '/panel/reservas-sucursal'
    case 'cajero':
      return '/panel/pos'
    case 'proveedor':
      return '/panel/mis-productos'
    default:
      return '/'
  }
}

export function construirAuth(usuario) {
  const rol = usuario?.rol?.nombre ?? null
  return {
    usuario,
    estaLogueado: usuario !== null,
    rol,
    esSuperadmin: rol === 'superadmin',
    esAdmin: rol === 'administrador',
    esEncargado: rol === 'encargado',
    esCajero: rol === 'cajero',
    esProveedor: rol === 'proveedor',
    esCliente: rol === 'cliente',
    tieneRol: (...roles) => rol !== null && roles.includes(rol),
    rutaInicio: () => rutaInicioDe(rol),
  }
}

export function useAuth() {
  const usuario = useAuthStore((s) => s.usuario)
  return construirAuth(usuario)
}

export function authActual() {
  return construirAuth(useAuthStore.getState().usuario)
}

function leerUsuarioGuardado() {
  return leerJson(USER_KEY)
}

function leerJson(clave) {
  try {
    const raw = localStorage.getItem(clave)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useEmpresa() {
  return useAuthStore((s) => s.empresa)
}
