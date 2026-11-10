import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth, useAuthStore, useEmpresa } from '@/core/stores/auth.store'
import { useSuscripcionStore } from '@/core/stores/suscripcion.store'
import { http } from '@/core/api/http'
import { estaEnLinea } from '@/core/offline/conexion.store'
import { descargarParaSinConexion, ultimaDescarga } from '@/core/offline/datos-locales'
import { cajaService } from '@/features/caja/services/caja.service'

const HORAS_PARA_REDESCARGAR = 12

/** Una vez por sesión: deja el catálogo en IndexedDB para poder trabajar sin conexión. */
function descargarSiHaceFalta() {
  try {
    if (sessionStorage.getItem('datos_sin_conexion_revisados')) return
    sessionStorage.setItem('datos_sin_conexion_revisados', '1')
  } catch {
    return
  }
  const ultima = ultimaDescarga()
  const vieja = !ultima || Date.now() - new Date(ultima.fecha).getTime() > HORAS_PARA_REDESCARGAR * 3600_000
  if (!estaEnLinea()) return
  // El turno abierto se recuerda para seguir cobrando sin conexión dentro del mismo turno.
  cajaService.turnoActual().catch(() => {})
  if (vieja) descargarParaSinConexion(http).catch(() => {})
}
import { useVentasEnCola } from '@/core/offline/cola-ventas.store'
import { cx } from '@/shared/utils/clases'

const MENUS = {
  administrador: [
    { titulo: 'General', items: [{ icono: 'dashboard', etiqueta: 'Tablero', ruta: '/panel' }] },
    {
      titulo: 'Catálogo',
      items: [
        { icono: 'list_alt', etiqueta: 'Catálogos maestros', ruta: '/panel/catalogos' },
        { icono: 'inventory_2', etiqueta: 'Productos', ruta: '/panel/productos' },
        { icono: 'sell', etiqueta: 'Promociones', ruta: '/panel/promociones' },
        { icono: 'local_shipping', etiqueta: 'Proveedores', ruta: '/panel/proveedores' },
      ],
    },
    {
      titulo: 'Operaciones',
      items: [
        { icono: 'analytics', etiqueta: 'Inventario global', ruta: '/panel/inventario' },
        { icono: 'warehouse', etiqueta: 'Almacenes', ruta: '/panel/almacenes' },
        { icono: 'receipt_long', etiqueta: 'Ventas', ruta: '/panel/ventas' },
        { icono: 'swap_horiz', etiqueta: 'Cambios de prendas', ruta: '/panel/cambios' },
        { icono: 'local_shipping', etiqueta: 'Pedidos online', ruta: '/panel/pedidos' },
        { icono: 'point_of_sale', etiqueta: 'Punto de venta', ruta: '/panel/pos' },
        { icono: 'account_balance_wallet', etiqueta: 'Mi caja', ruta: '/panel/caja' },
        { icono: 'schedule', etiqueta: 'Turnos y arqueos', ruta: '/panel/turnos' },
        { icono: 'cloud_sync', etiqueta: 'Sincronización', ruta: '/panel/sincronizacion' },
        { icono: 'confirmation_number', etiqueta: 'Comprobantes', ruta: '/panel/comprobantes' },
        { icono: 'history', etiqueta: 'Bitácora', ruta: '/panel/bitacora' },
        {
          icono: 'psychology',
          etiqueta: 'Reportes con IA',
          ruta: '/panel/reportes',
          funcion: 'reportes_ia',
          // Sin IA en el plan, el administrador igual tiene los reportes convencionales.
          sinFuncion: { icono: 'bar_chart', etiqueta: 'Reportes' },
        },
        { icono: 'model_training', etiqueta: 'Analítica inteligente', ruta: '/panel/analitica' },
      ],
    },
    {
      titulo: 'Sistema',
      items: [
        { icono: 'workspace_premium', etiqueta: 'Mi plan', ruta: '/panel/mi-plan' },
        { icono: 'group', etiqueta: 'Usuarios', ruta: '/panel/usuarios' },
        { icono: 'security', etiqueta: 'Roles', ruta: '/panel/roles' },
        { icono: 'badge', etiqueta: 'Trabajadores', ruta: '/panel/trabajadores' },
        { icono: 'store', etiqueta: 'Sucursales', ruta: '/panel/sucursales' },
        { icono: 'location_city', etiqueta: 'Ciudades', ruta: '/panel/ciudades' },
      ],
    },
  ],
  encargado: [
    {
      titulo: null,
      items: [
        { icono: 'event', etiqueta: 'Reservas de mi sucursal', ruta: '/panel/reservas-sucursal' },
        { icono: 'local_shipping', etiqueta: 'Pedidos online', ruta: '/panel/pedidos' },
        { icono: 'inventory_2', etiqueta: 'Stock de mi sucursal', ruta: '/panel/stock' },
        { icono: 'warehouse', etiqueta: 'Almacenes', ruta: '/panel/almacenes' },
        { icono: 'receipt_long', etiqueta: 'Ventas de mi sucursal', ruta: '/panel/ventas-sucursal' },
        { icono: 'swap_horiz', etiqueta: 'Cambios de prendas', ruta: '/panel/cambios' },
        { icono: 'schedule', etiqueta: 'Turnos y arqueos', ruta: '/panel/turnos' },
        { icono: 'psychology', etiqueta: 'Reportes con IA', ruta: '/panel/reportes', funcion: 'reportes_ia' },
        { icono: 'model_training', etiqueta: 'Analítica inteligente', ruta: '/panel/analitica' },
      ],
    },
  ],
  cajero: [
    {
      titulo: null,
      items: [
        { icono: 'point_of_sale', etiqueta: 'Punto de venta', ruta: '/panel/pos' },
        { icono: 'swap_horiz', etiqueta: 'Cambios de prendas', ruta: '/panel/cambios' },
        { icono: 'local_shipping', etiqueta: 'Pedidos online', ruta: '/panel/pedidos' },
        { icono: 'account_balance_wallet', etiqueta: 'Mi caja', ruta: '/panel/caja' },
        { icono: 'schedule', etiqueta: 'Mis turnos', ruta: '/panel/turnos' },
        { icono: 'cloud_sync', etiqueta: 'Sincronización', ruta: '/panel/sincronizacion' },
        { icono: 'psychology', etiqueta: 'Reportes con IA', ruta: '/panel/reportes', funcion: 'reportes_ia' },
      ],
    },
  ],
  superadmin: [
    {
      titulo: 'Plataforma SaaS',
      items: [
        { icono: 'domain', etiqueta: 'Empresas', ruta: '/plataforma' },
        { icono: 'workspace_premium', etiqueta: 'Planes', ruta: '/plataforma/planes' },
      ],
    },
  ],
  proveedor: [
    {
      titulo: null,
      items: [{ icono: 'inventory_2', etiqueta: 'Mis productos', ruta: '/panel/mis-productos' }],
    },
  ],
}

const ETIQUETAS_ROL = {
  administrador: 'Administrador',
  encargado: 'Encargado',
  cajero: 'Cajero',
  proveedor: 'Proveedor',
  superadmin: 'Superadmin',
}

/** Quita (o cambia) los ítems que el plan de la empresa no incluye. */
function segunPlan(secciones, plan) {
  if (!plan) return secciones
  return secciones.map((seccion) => ({
    ...seccion,
    items: seccion.items.flatMap((item) => {
      if (!item.funcion || plan[item.funcion]) return [item]
      return item.sinFuncion ? [{ ...item, ...item.sinFuncion }] : []
    }),
  }))
}

export default function LayoutPanel() {
  const auth = useAuth()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const [colapsada, setColapsada] = useState(auth.esCajero)

  const empresa = useEmpresa()
  const suscripcion = useSuscripcionStore((s) => s.datos)
  const cargarSuscripcion = useSuscripcionStore((s) => s.cargar)
  const usuarioId = auth.usuario?.id
  const esSuperadmin = auth.esSuperadmin
  useEffect(() => {
    if (usuarioId && !esSuperadmin) cargarSuscripcion({ forzar: true })
  }, [usuarioId, esSuperadmin, cargarSuscripcion])

  const personalDeTienda = auth.tieneRol('administrador', 'encargado', 'cajero')
  useEffect(() => {
    if (usuarioId && personalDeTienda) descargarSiHaceFalta()
  }, [usuarioId, personalDeTienda])

  const secciones = segunPlan(MENUS[auth.rol ?? ''] ?? [], suscripcion?.plan)
  const nombreMarca = auth.esSuperadmin ? 'FashionStore SaaS' : (empresa?.nombre ?? 'FashionStore')
  const inicio = auth.esSuperadmin ? '/plataforma' : '/panel'
  const etiquetaRol = auth.rol ? (ETIQUETAS_ROL[auth.rol] ?? auth.rol) : ''
  const u = auth.usuario
  const iniciales = u ? `${u.nombre.charAt(0)}${u.apellido.charAt(0)}`.toUpperCase() : ''

  const enCola = useVentasEnCola(auth.usuario?.id)

  const cerrarSesion = () => {
    if (
      enCola.length > 0 &&
      !window.confirm(
        `Tienes ${enCola.length} venta(s) sin sincronizar en este equipo. Se enviarán cuando vuelvas a iniciar sesión aquí. ¿Cerrar sesión igual?`,
      )
    ) {
      return
    }
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <nav
        className={cx(
          'no-imprimir fixed left-0 top-0 z-20 flex h-screen flex-col border-r border-outline-variant bg-surface-container-lowest py-4 transition-all',
          colapsada ? 'w-[72px] px-2' : 'w-[260px] px-4',
        )}
      >
        <Link to={inicio} className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary shadow-card">
            <span className="material-symbols-outlined text-white">storefront</span>
          </div>
          {!colapsada && (
            <div>
              <h1 className="text-base font-bold leading-tight text-primary">{nombreMarca}</h1>
              <p className="text-xs text-on-surface-variant">{etiquetaRol}</p>
            </div>
          )}
        </Link>

        <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden">
          {secciones.map((seccion) => (
            <div key={seccion.titulo ?? 'sin-titulo'}>
              {seccion.titulo && !colapsada && (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  {seccion.titulo}
                </p>
              )}
              <div className="space-y-1">
                {seccion.items.map((item) => (
                  <NavLink
                    key={item.ruta}
                    to={item.ruta}
                    end={item.ruta === '/panel' || item.ruta === '/plataforma'}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary',
                        colapsada && 'justify-center',
                        isActive && 'bg-surface-container text-primary',
                      )
                    }
                    title={item.etiqueta}
                  >
                    <span className="material-symbols-outlined shrink-0">{item.icono}</span>
                    {!colapsada && <span className="truncate">{item.etiqueta}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto border-t border-outline-variant pt-3">
          <div className={cx('flex items-center gap-3 px-2 py-2', colapsada && 'justify-center')}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container text-xs font-bold text-primary">
              {iniciales}
            </div>
            {!colapsada && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-on-surface">{[u?.nombre, u?.apellido].join(' ')}</p>
                <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {etiquetaRol}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className={cx(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-error/5 hover:text-error',
              colapsada && 'justify-center',
            )}
            onClick={cerrarSesion}
            title="Cerrar sesión"
          >
            <span className="material-symbols-outlined shrink-0">logout</span>
            {!colapsada && <span>Cerrar sesión</span>}
          </button>
        </div>
      </nav>

      <div
        className={cx(
          'flex min-h-screen flex-1 flex-col transition-all print:ml-0!',
          colapsada ? 'ml-[72px]' : 'ml-[260px]',
        )}
      >
        <header className="no-imprimir sticky top-0 z-10 flex h-16 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-6 shadow-card">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
              onClick={() => setColapsada(!colapsada)}
              aria-label="Colapsar menú"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            {!auth.esSuperadmin && (
              <Link
                to="/"
                className="hidden items-center gap-1 text-xs text-on-surface-variant hover:text-primary sm:flex"
              >
                <span className="material-symbols-outlined text-[16px]">storefront</span>
                Ver tienda
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar..."
                className="w-64 rounded-lg border border-outline-variant bg-surface py-1.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              className="relative rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
              aria-label="Notificaciones"
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <Link
              to="/perfil"
              title="Mi perfil"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-on-primary"
            >
              {iniciales}
            </Link>
          </div>
        </header>

        {!auth.esSuperadmin && <AvisoSuscripcion suscripcion={suscripcion} esAdmin={auth.esAdmin} />}

        <main className="flex-1 overflow-x-hidden p-6">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

/** Franja de aviso cuando la suscripción vence pronto, venció o la empresa está suspendida. */
function AvisoSuscripcion({ suscripcion, esAdmin }) {
  if (!suscripcion) return null
  const { estado, dias_restantes: dias } = suscripcion

  let texto = null
  let grave = true
  if (estado === 'empresa_suspendida') {
    texto = 'La empresa está suspendida: no se pueden hacer operaciones.'
  } else if (estado === 'vencida' || estado === 'sin_suscripcion') {
    texto = 'La suscripción venció: el sistema quedó en modo solo consulta hasta renovar el plan.'
  } else if (dias !== null && dias <= 7) {
    grave = false
    texto = dias === 0 ? 'La suscripción vence hoy.' : `La suscripción vence en ${dias} día(s).`
  }
  if (!texto) return null

  return (
    <div
      className={cx(
        'no-imprimir flex items-center justify-between gap-3 border-b px-6 py-2 text-sm',
        grave ? 'border-error/30 bg-error/5 text-error' : 'border-primary/30 bg-primary/5 text-primary',
      )}
      role="alert"
    >
      <span className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">{grave ? 'error' : 'schedule'}</span>
        {texto}
      </span>
      {esAdmin && estado !== 'empresa_suspendida' && (
        <Link to="/panel/mi-plan" className="font-semibold underline">
          Ver mi plan
        </Link>
      )}
    </div>
  )
}
