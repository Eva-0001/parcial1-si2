import { http } from '@/core/api/http'

/** Empresa (tenant), planes y suscripción de la plataforma SaaS. */
export const empresaService = {
  planes() {
    return http.get('/planes')
  },

  /** Alta pública de una empresa: devuelve la sesión de su administrador. */
  registrar(datos) {
    return http.post('/empresas/registro', datos)
  },

  publica(slug) {
    return http.get(`/empresas/publica/${encodeURIComponent(slug)}`)
  },

  actual() {
    return http.get('/empresa/actual')
  },

  historial() {
    return http.get('/empresa/suscripciones')
  },

  actualizar(datos) {
    return http.put('/empresa/actual', datos)
  },

  cambiarPlan(plan, meses = 1) {
    return http.post('/empresa/suscripcion/cambiar-plan', { plan, meses })
  },

  renovar(meses = 1) {
    return http.post('/empresa/suscripcion/renovar', { meses })
  },
}

/** Administración de la plataforma: solo el superadmin. */
export const plataformaService = {
  empresas() {
    return http.get('/plataforma/empresas')
  },

  historial(id) {
    return http.get(`/plataforma/empresas/${id}/suscripciones`)
  },

  cambiarEstado(id, estado) {
    return http.patch(`/plataforma/empresas/${id}/estado`, { estado })
  },

  asignarPlan(id, plan, meses = 1) {
    return http.post(`/plataforma/empresas/${id}/plan`, { plan, meses })
  },

  renovar(id, meses = 1) {
    return http.post(`/plataforma/empresas/${id}/renovar`, { meses })
  },

  planes() {
    return http.get('/plataforma/planes')
  },

  crearPlan(datos) {
    return http.post('/plataforma/planes', datos)
  },

  actualizarPlan(id, datos) {
    return http.put(`/plataforma/planes/${id}`, datos)
  },
}

/** Funciones que un plan puede incluir, con su etiqueta para la interfaz. */
export const FUNCIONES_DE_PLAN = [
  { clave: 'gestion_productos', etiqueta: 'Gestión de productos' },
  { clave: 'gestion_ventas', etiqueta: 'Gestión de ventas' },
  { clave: 'reservas', etiqueta: 'Reservas' },
  { clave: 'operacion_offline', etiqueta: 'Operación sin conexión' },
  { clave: 'reportes_convencionales', etiqueta: 'Reportes convencionales' },
  { clave: 'reportes_ia', etiqueta: 'Reportes generativos con IA' },
]

export const ETIQUETA_ESTADO = {
  activa: 'Activa',
  vencida: 'Vencida',
  sin_suscripcion: 'Sin suscripción',
  empresa_suspendida: 'Empresa suspendida',
}
