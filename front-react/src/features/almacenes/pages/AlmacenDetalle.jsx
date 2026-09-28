import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { almacenesService } from '../services/almacenes.service'
import { TIPOS_MOVIMIENTO, etiquetaProducto } from '../almacenes.utils'
import ModalMovimientoAlmacen from '../components/ModalMovimientoAlmacen'
import { productosService } from '@/features/productos/services/productos.service'
import { sucursalesService } from '@/features/sucursales/services/sucursales.service'
import { useAuth } from '@/core/stores/auth.store'
import { cargarReferencias, useReferencias } from '@/core/stores/referencias.store'
import Skeleton from '@/shared/components/Skeleton'
import Tabla from '@/shared/components/Tabla'
import Miniatura from '@/shared/components/Miniatura'
import { formatoFecha, formatoNumero } from '@/shared/utils/formato'
import { cx } from '@/shared/utils/clases'

const PESTANAS = [
  ['stock', 'Stock'],
  ['movimientos', 'Movimientos'],
]

export default function AlmacenDetalle() {
  const { id } = useParams()
  return <Detalle key={id} id={Number(id)} />
}

function Detalle({ id }) {
  const auth = useAuth()
  const referencias = useReferencias()

  const [almacen, setAlmacen] = useState(null)
  const [stock, setStock] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [error, setError] = useState(null)
  const [pestana, setPestana] = useState('stock')
  const [busqueda, setBusqueda] = useState('')
  const [registrando, setRegistrando] = useState(null)

  const pedir = useCallback(() => {
    Promise.all([
      almacenesService.obtener(id),
      almacenesService.stock(id),
      almacenesService.movimientos(id),
      sucursalesService.listar(),
      cargarReferencias(),
    ])
      .then(([a, s, m, sucs]) => {
        setAlmacen(a)
        setStock(s)
        setMovimientos(m)
        setSucursales(sucs)
        setError(null)
      })
      .catch((e) => setError(e.status === 404 ? 'El almacén no existe.' : e.message))
  }, [id])

  useEffect(() => {
    pedir()
  }, [pedir])

  if (error) {
    return (
      <div className="tarjeta flex flex-col items-center py-16 text-center">
        <span className="material-symbols-outlined text-[48px] text-error">error</span>
        <h1 className="mt-2 text-xl font-semibold text-on-surface">{error}</h1>
        <Link to="/panel/almacenes" className="btn-secundario mt-6">
          Volver a los almacenes
        </Link>
      </div>
    )
  }
  if (!almacen) return <Skeleton tipo="bloque" />

  const texto = busqueda.trim().toLowerCase()
  const conStock = stock.filter((s) => s.cantidad > 0)
  const filtrado = conStock.filter((s) => !texto || etiquetaProducto(s.producto, referencias).toLowerCase().includes(texto))
  const unidades = conStock.reduce((acc, s) => acc + s.cantidad, 0)

  const acciones = auth.esAdmin ? ['ingreso', 'envio', 'devolucion'] : ['envio', 'devolucion']

  return (
    <>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to="/panel/almacenes"
              className="mb-2 inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span> Almacenes
            </Link>
            <h1 className="text-3xl font-semibold text-on-surface">{almacen.nombre}</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {[almacen.ciudad?.nombre, almacen.ubicacion].filter(Boolean).join(' · ')} · {formatoNumero(unidades)} unidades en{' '}
              {conStock.length} {conStock.length === 1 ? 'producto' : 'productos'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {acciones.map((tipo) => (
              <button
                key={tipo}
                type="button"
                className={tipo === 'ingreso' ? 'btn-primario' : 'btn-secundario'}
                onClick={() => setRegistrando(tipo)}
              >
                <span className="material-symbols-outlined text-[18px]">{TIPOS_MOVIMIENTO[tipo].icono}</span>
                {TIPOS_MOVIMIENTO[tipo].titulo}
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-surface-container-low p-1">
            {PESTANAS.map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                className={cx(
                  'rounded-md px-4 py-1.5 text-sm font-semibold transition-colors',
                  pestana === valor ? 'bg-surface-container-lowest text-primary shadow-card' : 'text-on-surface-variant',
                )}
                onClick={() => setPestana(valor)}
              >
                {etiqueta}
                {valor === 'movimientos' ? ` (${movimientos.length})` : ''}
              </button>
            ))}
          </div>
          {pestana === 'stock' && (
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                search
              </span>
              <input
                type="search"
                placeholder="Buscar producto, talla o color"
                className="campo w-72 pl-9"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          )}
        </div>

        {pestana === 'stock' ? (
          <Tabla
            vacio={filtrado.length === 0}
            iconoVacio="inventory_2"
            tituloVacio={busqueda ? 'Sin resultados' : 'El almacén está vacío'}
            descripcionVacio={busqueda ? null : 'Registra un ingreso de mercadería o una devolución desde una sucursal.'}
            pie={<p>{filtrado.length} productos</p>}
          >
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Talla</th>
                  <th>Color</th>
                  <th className="text-right">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {filtrado.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Miniatura url={s.producto ? productosService.urlFoto(s.producto) : null} alt={s.producto?.nombre} />
                        <span className="font-semibold">{s.producto?.nombre}</span>
                      </div>
                    </td>
                    <td>{referencias.nombre('tallas', s.producto?.talla_id) ?? '—'}</td>
                    <td>{referencias.nombre('colores', s.producto?.color_id) ?? '—'}</td>
                    <td className="text-right font-semibold tabular-nums">{s.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tabla>
        ) : (
          <Tabla
            vacio={movimientos.length === 0}
            iconoVacio="swap_horiz"
            tituloVacio="Sin movimientos todavía"
            pie={<p>Últimos {movimientos.length} movimientos</p>}
          >
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Sucursal</th>
                  <th>Productos</th>
                  <th>Registró</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const info = TIPOS_MOVIMIENTO[m.tipo]
                  const total = m.detalles.reduce((acc, d) => acc + d.cantidad, 0)
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap tabular-nums text-on-surface-variant">
                        {formatoFecha(m.creado_en, 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td>
                        <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', info.chip)}>
                          <span className="material-symbols-outlined text-[14px]">{info.icono}</span>
                          {info.etiqueta}
                        </span>
                      </td>
                      <td>{m.sucursal?.nombre ?? '—'}</td>
                      <td>
                        <p className="font-semibold">
                          {total} {total === 1 ? 'unidad' : 'unidades'}
                        </p>
                        <ul className="text-xs text-on-surface-variant">
                          {m.detalles.map((d) => (
                            <li key={d.id}>
                              {d.cantidad} × {etiquetaProducto(d.producto, referencias)}
                            </li>
                          ))}
                        </ul>
                        {m.observacion && <p className="mt-1 text-xs italic text-on-surface-variant">{m.observacion}</p>}
                      </td>
                      <td className="text-on-surface-variant">{m.usuario?.username ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Tabla>
        )}
      </div>

      {registrando && (
        <ModalMovimientoAlmacen
          almacen={almacen}
          tipo={registrando}
          stockAlmacen={stock}
          sucursales={sucursales}
          onCerrar={() => setRegistrando(null)}
          onGuardado={() => {
            setRegistrando(null)
            pedir()
          }}
        />
      )}
    </>
  )
}
