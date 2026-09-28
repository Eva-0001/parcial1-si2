import { http, limpiarParams } from '@/core/api/http'
import { authActual } from '@/core/stores/auth.store'

// El turno abierto es del usuario, así que el service worker no lo guarda: se guarda
// aquí para que el POS siga cobrando sin conexión dentro del mismo turno.
const claveTurno = () => `turno_caja_${authActual().usuario?.id ?? 'anonimo'}`

function recordarTurno(actual) {
  try {
    localStorage.setItem(claveTurno(), JSON.stringify(actual))
  } catch {
    // Sin almacenamiento local solo se pierde el modo offline del POS.
  }
  return actual
}

function turnoRecordado() {
  try {
    const raw = localStorage.getItem(claveTurno())
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const cajaService = {
  /** Turno abierto con su arqueo. Sin conexión devuelve el último conocido con `sin_conexion: true`. */
  turnoActual() {
    return http
      .get('/caja/turno-actual')
      .then(recordarTurno)
      .catch((e) => {
        const guardado = e.status === 0 ? turnoRecordado() : null
        if (guardado) return { ...guardado, sin_conexion: true }
        throw e
      })
  },

  listarTurnos(filtros = {}) {
    return http.get('/caja/turnos', { params: limpiarParams(filtros) })
  },

  obtenerTurno(id) {
    return http.get(`/caja/turnos/${id}`)
  },

  abrir(datos) {
    return http.post('/caja/turnos', datos).then(recordarTurno)
  },

  registrarMovimiento(turnoId, datos) {
    return http.post(`/caja/turnos/${turnoId}/movimientos`, datos)
  },

  cerrar(turnoId, datos) {
    return http.post(`/caja/turnos/${turnoId}/cierre`, datos).then((detalle) => {
      recordarTurno({ turno: null, resumen: null })
      return detalle
    })
  },
}
