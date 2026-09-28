import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { modelosService } from '../services/modelos.service'
import { productosService } from '../services/productos.service'
import { compararTallas } from '@/features/catalogos/catalogos.config'
import { cargarReferencias, useReferencias } from '@/core/stores/referencias.store'
import { toast } from '@/core/stores/toast.store'
import Tabla from '@/shared/components/Tabla'
import Miniatura from '@/shared/components/Miniatura'
import ModalConfirmacion from '@/shared/components/ModalConfirmacion'
import { monedaBs } from '@/shared/utils/moneda-bs'

/** Lista de productos base con el resumen de sus variantes (colores, tallas, stock). */
export default function ListaModelos({ titulo, base, puedeEliminar }) {
  const referencias = useReferencias()

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [modelos, setModelos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const [aEliminar, setAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState(null)

  const texto = busqueda.trim().toLowerCase()
  const filtrados = modelos.filter(
    (m) =>
      (categoria === '' || m.categoria_id === Number(categoria)) &&
      (!texto ||
        m.nombre.toLowerCase().includes(texto) ||
        m.variantes.some((v) => v.sku.toLowerCase().includes(texto))),
  )

  const pedir = useCallback(() => {
    Promise.all([modelosService.listar(), cargarReferencias()])
      .then(([lista]) => {
        setModelos(lista)
        setError(null)
        setCargando(false)
      })
      .catch((e) => {
        setError(e.message)
        setCargando(false)
      })
  }, [])

  useEffect(() => {
    pedir()
  }, [pedir])

  const eliminar = () => {
    setEliminando(true)
    modelosService
      .eliminar(aEliminar.id)
      .then(() => {
        setModelos((lista) => lista.filter((m) => m.id !== aEliminar.id))
        setAEliminar(null)
        toast.exito('Producto eliminado con sus variantes')
      })
      .catch((e) => setErrorEliminar(e.message))
      .finally(() => setEliminando(false))
  }

  const resumen = (m) => {
    const colores = [...new Set(m.variantes.map((v) => v.color_id).filter(Boolean))]
    const tallas = [...new Set(m.variantes.map((v) => v.talla_id).filter(Boolean))]
      .map((id) => referencias.nombre('tallas', id))
      .filter(Boolean)
      .sort(compararTallas)
    const precios = m.variantes.map((v) => Number(v.precio))
    return {
      colores: colores.map((id) => referencias.nombre('colores', id)).filter(Boolean),
      tallas,
      desde: Math.min(...precios),
      hasta: Math.max(...precios),
      foto: m.variantes.find((v) => v.foto),
    }
  }

  const variantesTotales = filtrados.reduce((acc, m) => acc + m.variantes.length, 0)

  return (
    <>
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">{titulo}</h1>
            <p className="text-sm text-on-surface-variant">
              Cada producto agrupa sus variantes de color y talla; el stock se lleva por variante.
            </p>
          </div>
          <Link to={`${base}/nuevo`} className="btn-primario shrink-0">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nuevo producto
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
              search
            </span>
            <input
              type="search"
              placeholder="Buscar por nombre o SKU..."
              className="campo w-64 pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <select className="campo w-48" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {referencias.lista('categorias').map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <Tabla
          cargando={cargando}
          error={error}
          vacio={filtrados.length === 0}
          iconoVacio="checkroom"
          tituloVacio={modelos.length ? 'Sin resultados' : 'Todavía no hay productos'}
          onReintentar={() => {
            setCargando(true)
            pedir()
          }}
          pie={
            <p>
              {filtrados.length} {filtrados.length === 1 ? 'producto' : 'productos'} · {variantesTotales} variantes
            </p>
          }
        >
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Colores</th>
                <th>Tallas</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => {
                const r = resumen(m)
                return (
                  <tr key={m.id}>
                    <td>
                      <Link to={`${base}/${m.id}/editar`} className="flex items-center gap-3 hover:text-primary">
                        <Miniatura url={r.foto ? productosService.urlFoto(r.foto) : null} alt={m.nombre} />
                        <span>
                          <span className="block font-semibold">{m.nombre}</span>
                          <span className="text-xs text-on-surface-variant">
                            {referencias.nombre('categorias', m.categoria_id) ?? 'Sin categoría'} · {m.variantes.length}{' '}
                            {m.variantes.length === 1 ? 'variante' : 'variantes'}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="max-w-[180px] text-sm">{r.colores.join(', ') || '—'}</td>
                    <td className="text-sm">{r.tallas.join(' · ') || '—'}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {r.desde === r.hasta ? monedaBs(r.desde) : `${monedaBs(r.desde)} – ${monedaBs(r.hasta)}`}
                      {m.precio_mayor && (
                        <span className="block text-xs text-success">Mayor {monedaBs(m.precio_mayor)}</span>
                      )}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{m.stock}</td>
                    <td>
                      <div className="acciones-fila">
                        <Link to={`${base}/${m.id}/editar`} className="btn-icono" title="Editar">
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </Link>
                        {puedeEliminar && (
                          <button
                            type="button"
                            className="btn-icono-peligro"
                            title="Eliminar"
                            onClick={() => {
                              setErrorEliminar(null)
                              setAEliminar(m)
                            }}
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Tabla>
      </div>

      {aEliminar && (
        <ModalConfirmacion
          titulo={`¿Eliminar ${aEliminar.nombre}?`}
          mensaje="Se eliminan también sus variantes. Si alguna tiene stock o movimientos, no se podrá."
          error={errorEliminar}
          cargando={eliminando}
          onConfirmar={eliminar}
          onCancelar={() => setAEliminar(null)}
        />
      )}
    </>
  )
}
