import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { useAuthStore } from '@/core/stores/auth.store'
import { cambiarTienda } from '@/core/stores/tienda.store'
import PanelAuth from '@/features/auth/components/PanelAuth'
import CampoPassword from '@/shared/components/CampoPassword'
import FuerzaPassword from '@/shared/components/FuerzaPassword'
import {
  correoValido,
  errorDe,
  marcarErrorApi,
  maximo,
  minimo,
  patronUsername,
  requerido,
} from '@/shared/utils/formularios'
import { MIN_PASSWORD } from '@/shared/utils/password'
import { cx } from '@/shared/utils/clases'
import { FUNCIONES_DE_PLAN, empresaService } from '../services/empresa.service'

const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** "Moda Andina S.R.L." -> "moda-andina-s-r-l" */
function aSlug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function Campo({ id, etiqueta, error, children }) {
  return (
    <div>
      <label className="etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      {children}
      {error && <p className="mensaje-campo">{errorDe(error)}</p>}
    </div>
  )
}

export default function RegistroEmpresa() {
  const [planes, setPlanes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [slugEditado, setSlugEditado] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm({
    mode: 'onTouched',
    defaultValues: {
      nombre: '',
      slug: '',
      nit: '',
      telefono: '',
      ciudad: '',
      sucursal: '',
      plan: 'basico',
      adminNombre: '',
      adminApellido: '',
      correo: '',
      username: '',
      password: '',
    },
  })

  const nombre = useWatch({ control, name: 'nombre' }) ?? ''
  const planElegido = useWatch({ control, name: 'plan' })
  const password = useWatch({ control, name: 'password' }) ?? ''

  useEffect(() => {
    empresaService
      .planes()
      .then(setPlanes)
      .catch(() => setPlanes([]))
  }, [])

  // El identificador sigue al nombre hasta que el usuario lo edite a mano.
  useEffect(() => {
    if (!slugEditado) setValue('slug', aSlug(nombre))
  }, [nombre, slugEditado, setValue])

  const enviar = async (v) => {
    setCargando(true)
    setErrorGeneral(null)
    try {
      const res = await empresaService.registrar({
        nombre: v.nombre.trim(),
        slug: v.slug.trim(),
        nit: v.nit.trim() || undefined,
        telefono: v.telefono.trim() || undefined,
        correo: v.correo.trim().toLowerCase(),
        ciudad: v.ciudad.trim() || undefined,
        sucursal: v.sucursal.trim() || undefined,
        plan: v.plan,
        administrador: {
          nombre: v.adminNombre.trim(),
          apellido: v.adminApellido.trim(),
          correo: v.correo.trim().toLowerCase(),
          username: v.username.trim(),
          password: v.password,
        },
      })
      useAuthStore.getState().guardarSesion(res)
      cambiarTienda(res.empresa.slug)
      // Recarga completa: la app arranca ya dentro de la empresa nueva.
      window.location.assign('/panel/mi-plan')
    } catch (e) {
      setCargando(false)
      const texto = e.message.toLowerCase()
      if (e.status === 409 && texto.includes('identificador')) {
        marcarErrorApi(setError, 'slug', 'Ese identificador ya lo usa otra tienda')
      } else if (e.status === 409 && texto.includes('usuario')) {
        marcarErrorApi(setError, 'username', 'Ese nombre de usuario ya está en uso')
      } else if (e.status === 409 && texto.includes('correo')) {
        marcarErrorApi(setError, 'correo', 'Ese correo ya está registrado')
      } else {
        setErrorGeneral(e.message)
      }
    }
  }

  return (
    <PanelAuth ancho="ancho">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-on-surface">Registra tu empresa</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Creamos tu espacio de trabajo: tu tienda en línea, tu panel y tu primera sucursal.
        </p>
      </div>

      {errorGeneral && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border-l-4 border-error bg-error/5 p-4" role="alert">
          <span className="material-symbols-outlined mt-0.5 text-[20px] text-error">error</span>
          <p className="text-sm text-on-surface">{errorGeneral}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(enviar)} className="space-y-6" noValidate>
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Empresa</h2>
          <Campo id="nombre" etiqueta="Nombre comercial" error={errors.nombre}>
            <input
              id="nombre"
              className={cx('campo', errors.nombre && 'campo-invalido')}
              placeholder="Moda Andina"
              {...register('nombre', { required: requerido, maxLength: maximo(120) })}
            />
          </Campo>
          <Campo id="slug" etiqueta="Identificador de tu tienda" error={errors.slug}>
            <input
              id="slug"
              className={cx('campo', errors.slug && 'campo-invalido')}
              placeholder="moda-andina"
              {...register('slug', {
                required: requerido,
                maxLength: maximo(60),
                pattern: { value: PATRON_SLUG, message: 'Solo minúsculas, números y guiones' },
                onChange: () => setSlugEditado(true),
              })}
            />
            <p className="mt-1 text-xs text-on-surface-variant">
              Tus clientes entran con <code>?tienda=</code> seguido de este identificador.
            </p>
          </Campo>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo id="nit" etiqueta="NIT (opcional)" error={errors.nit}>
              <input id="nit" className="campo" {...register('nit', { maxLength: maximo(30) })} />
            </Campo>
            <Campo id="telefono" etiqueta="Teléfono (opcional)" error={errors.telefono}>
              <input id="telefono" className="campo" {...register('telefono', { maxLength: maximo(30) })} />
            </Campo>
            <Campo id="ciudad" etiqueta="Ciudad" error={errors.ciudad}>
              <input
                id="ciudad"
                className="campo"
                placeholder="Santa Cruz"
                {...register('ciudad', { maxLength: maximo(100) })}
              />
            </Campo>
            <Campo id="sucursal" etiqueta="Primera sucursal" error={errors.sucursal}>
              <input
                id="sucursal"
                className="campo"
                placeholder="Casa matriz"
                {...register('sucursal', { maxLength: maximo(100) })}
              />
            </Campo>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Plan</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {planes.map((plan) => (
              <label
                key={plan.codigo}
                className={cx(
                  'flex cursor-pointer flex-col rounded-xl border p-4 transition-colors',
                  planElegido === plan.codigo
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-outline-variant hover:border-primary',
                )}
              >
                <input type="radio" value={plan.codigo} className="sr-only" {...register('plan')} />
                <span className="flex items-baseline justify-between">
                  <span className="font-semibold text-on-surface">{plan.nombre}</span>
                  <span className="text-sm font-semibold text-primary">Bs {Number(plan.precio_mensual)}/mes</span>
                </span>
                <span className="mt-1 text-xs text-on-surface-variant">Hasta {plan.max_sucursales} sucursales</span>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {FUNCIONES_DE_PLAN.map((f) => (
                    <li
                      key={f.clave}
                      className={cx('flex items-center gap-1', plan[f.clave] ? 'text-on-surface' : 'text-outline line-through')}
                    >
                      <span className="material-symbols-outlined text-[14px]">{plan[f.clave] ? 'check' : 'close'}</span>
                      {f.etiqueta}
                    </li>
                  ))}
                </ul>
              </label>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">
            El primer mes se activa al registrarte. El cobro es simulado en este prototipo.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Administrador</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo id="adminNombre" etiqueta="Nombre" error={errors.adminNombre}>
              <input
                id="adminNombre"
                className={cx('campo', errors.adminNombre && 'campo-invalido')}
                {...register('adminNombre', { required: requerido, maxLength: maximo(100) })}
              />
            </Campo>
            <Campo id="adminApellido" etiqueta="Apellido" error={errors.adminApellido}>
              <input
                id="adminApellido"
                className={cx('campo', errors.adminApellido && 'campo-invalido')}
                {...register('adminApellido', { required: requerido, maxLength: maximo(100) })}
              />
            </Campo>
          </div>
          <Campo id="correo" etiqueta="Correo" error={errors.correo}>
            <input
              id="correo"
              type="email"
              autoComplete="email"
              className={cx('campo', errors.correo && 'campo-invalido')}
              {...register('correo', { required: requerido, validate: correoValido })}
            />
          </Campo>
          <Campo id="username" etiqueta="Usuario" error={errors.username}>
            <input
              id="username"
              autoComplete="username"
              className={cx('campo', errors.username && 'campo-invalido')}
              {...register('username', {
                required: requerido,
                minLength: minimo(3),
                maxLength: maximo(50),
                pattern: patronUsername,
              })}
            />
          </Campo>
          <Campo id="password" etiqueta="Contraseña" error={errors.password}>
            <CampoPassword
              id="password"
              autocomplete="new-password"
              invalido={!!errors.password}
              {...register('password', { required: requerido, minLength: minimo(MIN_PASSWORD) })}
            />
            <FuerzaPassword password={password} />
          </Campo>
        </section>

        <button type="submit" className="btn-primario w-full py-3" disabled={cargando}>
          {cargando ? 'Creando tu espacio...' : 'Crear mi empresa'}
        </button>
      </form>

      <p className="mt-8 border-t border-outline-variant pt-6 text-center text-sm text-on-surface-variant">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </PanelAuth>
  )
}
