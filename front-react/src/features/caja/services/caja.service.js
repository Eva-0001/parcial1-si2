import { http, limpiarParams } from '@/core/api/http'
import { authActual } from '@/core/stores/auth.store'
import { copiaUsuario, guardarCopiaUsuario } from '@/core/offline/copia-usuario'

// El turno abierto es del usuario, así que el service worker no lo guarda: se guarda
// aquí para que el POS siga cobrando sin conexión dentro del mismo turno.
const claveTurno = () => `turno_caja_${authActual().usuario?.id ?? 'anonimo'}`

function recordarTurno(actual) {
  try {
    // La fecha permite saber si este arqueo es más nuevo que la copia guardada por "Mi caja".
    localStorage.setItem(claveTurno(), JSON.stringify({ ...actual, guardado_en: new Date().toISOString() }))
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
        if (e.status !== 0) throw e
        // Sin conexión: el último turno conocido o, si nunca se consultó en este
        // equipo, "sin turno" (el POS igual muestra el catálogo guardado).
        const guardado = turnoRecordado()
        return guardado ? { ...guardado, sin_conexion: true } : { turno: null, sin_conexion: true }
      })
  },

  listarTurnos(filtros = {}) {
    return http.get('/caja/turnos', { params: limpiarParams(filtros) })
  },

  obtenerTurno(id) {
    return http.get(`/caja/turnos/${id}`)
  },

  /**
   * Detalle del turno abierto (arqueo, movimientos y ventas). Con conexión se guarda una copia
   * en el equipo; sin conexión devuelve esa copia con `sin_conexion: true` y su fecha.
   */
  async detalleTurnoActual() {
    const actual = await this.turnoActual()
    if (!actual.turno) return null
    if (!actual.sin_conexion) {
      const detalle = await this.obtenerTurno(actual.turno.id)
      guardarCopiaUsuario('caja', detalle)
      return detalle
    }

    const copia = await copiaUsuario('caja')
    const delTurno = copia?.datos?.turno?.id === actual.turno.id ? copia : null
    // El arqueo más reciente entre la copia de "Mi caja" y el último que pidió el punto de venta.
    const usarActual = !delTurno || (actual.guardado_en && actual.guardado_en > delTurno.guardado_en)
    return {
      turno: actual.turno,
      resumen: usarActual ? actual.resumen : delTurno.datos.resumen,
      movimientos: delTurno?.datos.movimientos ?? [],
      ventas: delTurno?.datos.ventas ?? [],
      sin_conexion: true,
      guardado_en: (usarActual ? actual.guardado_en : delTurno.guardado_en) ?? null,
    }
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
