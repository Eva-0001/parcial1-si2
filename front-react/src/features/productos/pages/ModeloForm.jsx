import { useCallback, useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { modelosService } from '../services/modelos.service'
import { productosService } from '../services/productos.service'
import SelectorChips from '../components/SelectorChips'
import VariantesModelo from '../components/VariantesModelo'
import { stockService } from '@/features/inventario/services/stock.service'
import { proveedoresService } from '@/features/proveedores/services/proveedores.service'
import { compararTallas } from '@/features/catalogos/catalogos.config'
import { cargarReferencias, useReferencias } from '@/core/stores/referencias.store'
import { authActual, useAuth } from '@/core/stores/auth.store'
import { toast } from '@/core/stores/toast.store'
import Skeleton from '@/shared/components/Skeleton'
import CampoImagen from '@/shared/components/CampoImagen'
import { errorDe, maximo, numeroONulo, requerido } from '@/shared/utils/formularios'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'

const DESPLEGABLES = [
  { campo: 'categoria_id', recurso: 'categorias', etiqueta: 'Categoría', obligatorio: true },
  { campo: 'coleccion_id', recurso: 'colecciones', etiqueta: 'Colección', obligatorio: false },
  { campo: 'temporada_id', recurso: 'temporadas', etiqueta: 'Temporada', obligatorio: false },
]

const patronPrecio = { value: /^\d{1,8}([.,]\d{1,2})?$/, message: 'Monto válido, hasta dos decimales' }
const aMonto = (texto) => Number(String(texto).replace(',', '.')).toFixed(2)

const valoresDe = (m) => ({
  nombre: m?.nombre ?? '',
  descripcion: m?.descripcion ?? '',
  precio: m ? Number(m.precio).toFixed(2) : '',
  precio_mayor: m?.precio_mayor != null ? Number(m.precio_mayor).toFixed(2) : '',
  minimo_mayor: String(m?.minimo_mayor ?? 6),
  categoria_id: m?.categoria_id ?? null,
  coleccion_id: m?.coleccion_id ?? null,
  temporada_id: m?.temporada_id ?? null,
  proveedor_id: m?.proveedor_id ?? null,
  aplicar_precio: false,
})

/** Alta y edición de un producto base (modelo) con sus variantes talla x color. */
export default function ModeloForm() {
  const { id } = useParams()
  return <Formulario key={id ?? 'nuevo'} id={id} />
}

function Formulario({ id }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const referencias = useReferencias()
  const esEdicion = id !== undefined
  const rutaLista = auth.esProveedor ? '/panel/mis-productos' : '/panel/productos'

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [modelo, setModelo] = useState(null)
  const [stockPorProducto, setStockPorProducto] = useState(() => new Map())

  const [colores, setColores] = useState([])
  const [tallas, setTallas] = useState([])
  const [foto, setFoto] = useState(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm({ mode: 'onTouched', defaultValues: valoresDe(null) })

  const recargar = useCallback(
    () =>
      Promise.all([modelosService.obtener(Number(id)), stockService.listar()]).then(([m, stock]) => {
        const suma = new Map()
        for (const s of stock) suma.set(s.producto_id, (suma.get(s.producto_id) ?? 0) + s.cantidad)
        setModelo(m)
        setStockPorProducto(suma)
        return m
      }),
    [id],
  )

  useEffect(() => {
    Promise.all([
      cargarReferencias(),
      authActual().esAdmin ? proveedoresService.listar() : Promise.resolve([]),
      esEdicion ? recargar() : Promise.resolve(null),
    ])
      .then(([, listaProveedores, m]) => {
        setProveedores(listaProveedores)
        reset(valoresDe(m))
        setCargando(false)
      })
      .catch((e) => {
        setErrorCarga(e.status === 404 ? 'El producto no existe o fue eliminado.' : e.message)
        setCargando(false)
      })
  }, [esEdicion, recargar, reset])

  const tallasOrdenadas = [...referencias.lista('tallas')].sort((a, b) => compararTallas(a.nombre, b.nombre))
  const matriz = colores.flatMap((c) => tallas.map((t) => ({ color_id: c, talla_id: t })))
  const precioActual = useWatch({ control, name: 'precio' })

  const guardar = (v) => {
    if (!esEdicion && matriz.length === 0) {
      setErrorGeneral('Elige al menos un color y una talla para crear las variantes.')
      return
    }
    setGuardando(true)
    setErrorGeneral(null)

    const datos = {
      nombre: v.nombre.trim(),
      descripcion: v.descripcion.trim() || null,
      precio: aMonto(v.precio),
      precio_mayor: v.precio_mayor.trim() ? aMonto(v.precio_mayor) : null,
      minimo_mayor: Number(v.minimo_mayor),
      categoria_id: v.categoria_id,
      coleccion_id: v.coleccion_id,
      temporada_id: v.temporada_id,
      ...(auth.esAdmin ? { proveedor_id: v.proveedor_id } : {}),
    }

    const peticion = esEdicion
      ? modelosService.actualizar(modelo.id, { ...datos, aplicar_precio: v.aplicar_precio })
      : modelosService.crear({ ...datos, variantes: matriz }).then(async (creado) => {
          // La foto inicial se usa en todas las variantes; luego se cambia por color.
          if (foto) {
            try {
              for (const variante of creado.variantes) await productosService.subirFoto(variante.id, foto)
            } catch (e) {
              toast.advertencia(`El producto se creó, pero la foto no: ${e.message}`)
            }
          }
          return creado
        })

    peticion
      .then((guardado) => {
        setGuardando(false)
        if (esEdicion) {
          toast.exito('Producto actualizado')
          setModelo(guardado)
          reset(valoresDe(guardado))
        } else {
          toast.exito(`Producto creado con ${guardado.variantes.length} variantes`)
          navigate(`${rutaLista}/${guardado.id}/editar`, { replace: true })
        }
      })
      .catch((e) => {
        setGuardando(false)
        setErrorGeneral(e.message)
      })
  }

  const faltanCatalogos =
    referencias.lista('categorias').length === 0 ||
    referencias.lista('colores').length === 0 ||
    referencias.lista('tallas').length === 0

  let contenido
  if (cargando) {
    contenido = <Skeleton tipo="bloque" />
  } else if (errorCarga) {
    contenido = (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <span className="material-symbols-outlined text-[48px] text-error">error</span>
        <p className="mt-2 font-semibold text-on-surface">{errorCarga}</p>
        <Link to={rutaLista} className="btn-secundario mt-6">
          Volver
        </Link>
      </div>
    )
  } else {
    contenido = (
      <div className="space-y-6">
        <form onSubmit={handleSubmit(guardar)} noValidate className="space-y-6">
          {errorGeneral && (
            <div className="rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm text-on-surface" role="alert">
              {errorGeneral}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="tarjeta space-y-5 lg:col-span-8">
              <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
                <span className="material-symbols-outlined text-primary">checkroom</span>
                Datos del producto
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="etiqueta" htmlFor="mo-nombre">
                    Nombre
                  </label>
                  <input
                    id="mo-nombre"
                    type="text"
                    placeholder="Ej. Polera básica algodón"
                    className={cx('campo', errors.nombre && 'campo-invalido')}
                    {...register('nombre', { required: requerido, maxLength: maximo(150) })}
                  />
                  {errors.nombre && <p className="mensaje-campo">{errorDe(errors.nombre)}</p>}
                </div>
                <div>
                  <label className="etiqueta" htmlFor="mo-precio">
                    Precio por menor
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface-variant">
                      Bs
                    </span>
                    <input
                      id="mo-precio"
                      type="text"
                      inputMode="decimal"
                      placeholder="120.50"
                      className={cx('campo pl-10 tabular-nums', errors.precio && 'campo-invalido')}
                      {...register('precio', { required: requerido, pattern: patronPrecio })}
                    />
                  </div>
                  {errors.precio && <p className="mensaje-campo">{errorDe(errors.precio)}</p>}
                </div>
              </div>

              <div>
                <label className="etiqueta" htmlFor="mo-descripcion">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <textarea
                  id="mo-descripcion"
                  rows={3}
                  className={cx('campo resize-y', errors.descripcion && 'campo-invalido')}
                  placeholder="Tela, corte, cuidados..."
                  {...register('descripcion', { maxLength: maximo(2000) })}
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {DESPLEGABLES.map((d) => (
                  <div key={d.campo}>
                    <label className="etiqueta" htmlFor={'mo-' + d.campo}>
                      {d.etiqueta}
                    </label>
                    <select
                      id={'mo-' + d.campo}
                      className={cx('campo', errors[d.campo] && 'campo-invalido')}
                      {...register(d.campo, { required: d.obligatorio ? requerido : false, setValueAs: numeroONulo })}
                    >
                      <option value="" disabled={d.obligatorio}>
                        {d.obligatorio ? 'Selecciona' : 'Ninguna'}
                      </option>
                      {referencias.lista(d.recurso).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                    {errors[d.campo] && <p className="mensaje-campo">{errorDe(errors[d.campo])}</p>}
                  </div>
                ))}
                {auth.esAdmin && (
                  <div>
                    <label className="etiqueta" htmlFor="mo-proveedor">
                      Proveedor
                    </label>
                    <select id="mo-proveedor" className="campo" {...register('proveedor_id', { setValueAs: numeroONulo })}>
                      <option value="">Ninguno</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-lg bg-surface-container-low p-4 sm:grid-cols-2">
                <div>
                  <label className="etiqueta" htmlFor="mo-precio-mayor">
                    Precio por mayor <span className="font-normal normal-case">(opcional)</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface-variant">
                      Bs
                    </span>
                    <input
                      id="mo-precio-mayor"
                      type="text"
                      inputMode="decimal"
                      placeholder="Vacío = solo por menor"
                      className={cx('campo pl-10 tabular-nums', errors.precio_mayor && 'campo-invalido')}
                      {...register('precio_mayor', {
                        pattern: patronPrecio,
                        validate: (valor, todos) =>
                          !valor.trim() ||
                          Number(valor.replace(',', '.')) < Number(String(todos.precio).replace(',', '.')) ||
                          'Debe ser menor que el precio por menor',
                      })}
                    />
                  </div>
                  {errors.precio_mayor && <p className="mensaje-campo">{errorDe(errors.precio_mayor)}</p>}
                </div>
                <div>
                  <label className="etiqueta" htmlFor="mo-minimo">
                    Mínimo de prendas surtidas
                  </label>
                  <input
                    id="mo-minimo"
                    type="number"
                    min={2}
                    max={1000}
                    className={cx('campo tabular-nums', errors.minimo_mayor && 'campo-invalido')}
                    {...register('minimo_mayor', {
                      required: requerido,
                      min: { value: 2, message: 'Mínimo 2' },
                      max: { value: 1000, message: 'Máximo 1000' },
                    })}
                  />
                  {errors.minimo_mayor && <p className="mensaje-campo">{errorDe(errors.minimo_mayor)}</p>}
                </div>
                <p className="text-xs text-on-surface-variant sm:col-span-2">
                  El precio por mayor se aplica cuando el cliente lleva al menos ese mínimo sumando cualquier prenda con
                  precio por mayor (puede combinar modelos, tallas y colores).
                </p>
              </div>

              {esEdicion && (
                <label className="flex items-center gap-2 text-sm text-on-surface">
                  <input type="checkbox" className="h-4 w-4 accent-primary" {...register('aplicar_precio')} />
                  Aplicar el precio por menor ({monedaBs(aMonto(precioActual || 0))}) a todas las variantes
                </label>
              )}

              {faltanCatalogos && (
                <p className="text-xs text-warning">
                  Faltan catálogos maestros (categorías, colores o tallas).{' '}
                  {auth.esAdmin ? (
                    <Link to="/panel/catalogos" className="font-semibold underline">
                      Cárgalos primero.
                    </Link>
                  ) : (
                    'Pídele al administrador que los cargue.'
                  )}
                </p>
              )}
            </section>

            {!esEdicion && (
              <section className="tarjeta lg:col-span-4">
                <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-primary">photo_camera</span>
                  Foto
                </h2>
                <CampoImagen deshabilitado={guardando} onArchivo={setFoto} onQuitarActual={() => setFoto(null)} />
                <p className="mt-3 text-xs text-on-surface-variant">
                  Se usa en todas las variantes. Después puedes poner una foto distinta por color.
                </p>
              </section>
            )}
          </div>

          {!esEdicion && (
            <section className="tarjeta space-y-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
                <span className="material-symbols-outlined text-primary">grid_view</span>
                Variantes: colores × tallas
              </h2>
              <div>
                <p className="etiqueta">Colores</p>
                <SelectorChips opciones={referencias.lista('colores')} seleccion={colores} onCambiar={setColores} />
              </div>
              <div>
                <p className="etiqueta">Tallas</p>
                <SelectorChips opciones={tallasOrdenadas} seleccion={tallas} onCambiar={setTallas} />
              </div>
              <p className="text-sm text-on-surface-variant">
                {matriz.length > 0
                  ? `Se crearán ${matriz.length} variantes (${colores.length} ${colores.length === 1 ? 'color' : 'colores'} × ${tallas.length} ${tallas.length === 1 ? 'talla' : 'tallas'}), cada una con su SKU y su propio stock.`
                  : 'Cada combinación de color y talla es una variante con su propio stock y SKU.'}
              </p>
            </section>
          )}

          <div className="flex items-center justify-end gap-3">
            <Link to={rutaLista} className="btn-secundario">
              {esEdicion ? 'Volver' : 'Cancelar'}
            </Link>
            <button type="submit" className="btn-primario" disabled={guardando || (esEdicion && !isDirty)}>
              {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : `Crear producto${matriz.length ? ` (${matriz.length} ${matriz.length === 1 ? 'variante' : 'variantes'})` : ''}`}
            </button>
          </div>
        </form>

        {esEdicion && modelo && (
          <section className="tarjeta">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-on-surface">
              <span className="material-symbols-outlined text-primary">grid_view</span>
              Variantes ({modelo.variantes.length})
            </h2>
            <p className="mb-4 text-sm text-on-surface-variant">
              Cada variante tiene su SKU, su precio de lista y su stock por sucursal (se carga en Inventario).
            </p>
            <VariantesModelo
              modelo={modelo}
              stockPorProducto={stockPorProducto}
              puedeEliminar={auth.esAdmin}
              onCambio={() => recargar().catch((e) => toast.error(e.message))}
            />
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-6">
        <Link
          to={rutaLista}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-primary"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Volver a {auth.esProveedor ? 'mis productos' : 'productos'}
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">
          {esEdicion ? (modelo?.nombre ?? 'Editar producto') : 'Nuevo producto'}
        </h1>
      </div>
      {contenido}
    </div>
  )
}
