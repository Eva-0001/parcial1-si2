export class ApiError extends Error {
  constructor(status, mensaje, codigo = null) {
    super(mensaje)
    this.status = status
    /** Código de negocio del backend (ej. FUNCION_NO_INCLUIDA, LIMITE_DEL_PLAN). */
    this.codigo = codigo
    this.name = 'ApiError'
  }
}
