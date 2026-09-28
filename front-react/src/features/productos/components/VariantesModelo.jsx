import { useRef, useState } from 'react'
import { modelosService } from '../services/modelos.service'
import { productosService } from '../services/productos.service'
import SelectorChips from './SelectorChips'
import { compararTallas } from '@/features/catalogos/catalogos.config'
import { useReferencias } from '@/core/stores/referencias.store'
import { toast } from '@/core/stores/toast.store'
import Miniatura from '@/shared/components/Miniatura'
import ModalConfirmacion from '@/shared/components/ModalConfirmacion'
import { IMAGENES_ACEPTADAS, prepararImagen } from '@/shared/utils/imagenes'
import { monedaBs } from '@/shared/utils/moneda-bs'

const PATRON_PRECIO = /^\d{1,8}([.,]\d{1,2})?$/
const PATRON_SKU = /^[A-Za-z0-9._-]{2,60}$/

/**
 * Variantes de un modelo agrupadas por color: foto por color, sku y precio por variante,
 * y alta de combinaciones nuevas talla x color.
 */
export default function VariantesModelo({ modelo, stockPorProducto, puedeEliminar, onCambio }) {
  const referencias = useReferencias()
  const variantes = modelo.variantes ?? []

  const [ediciones, setEdiciones] = useState({})
  const [guardando, setGuardando] = useState(null)
  const [subiendoColor, setSubiendoColor] = useState(null)
  const [aEliminar, setAEliminar] = useState(null)
  const [errorEliminar, setErrorEliminar] = useState(null)
  const [coloresNuevos, setColoresNuevos] = useState([])
  const [tallasNuevas, setTallasNuevas] = useState([])
  const [agregando, setAgregando] = useState(false)
  const entradaFoto = useRef(null)
  const colorDeFoto = useRef(null)

  const tallasOrdenadas = [...referencias.lista('tallas')].sort((a, b) => compararTallas(a.nombre, b.nombre))
  const ordenTalla = new Map(tallasOrdenadas.map((t, i) => [t.id, i]))

  const porColor = new Map()
  for (const v of variantes) {
    const clave = v.color_id ?? 0
    if (!porColor.has(clave)) porColor.set(clave, [])
    porColor.get(clave).push(v)
  }
  for (const lista of porColor.values()) {
    lista.sort((a, b) => (ordenTalla.get(a.talla_id) ?? 99) - (ordenTalla.get(b.talla_id) ?? 99))
  }

  const existe = new Set(variantes.map((v) => `${v.color_id ?? ''}|${v.talla_id ?? ''}`))
  const combinacionesNuevas = coloresNuevos
    .flatMap((c) => tallasNuevas.map((t) => ({ color_id: c, talla_id: t })))
    .filter((v) => !existe.has(`${v.color_id}|${v.talla_id}`))

  const valor = (v, campo) => ediciones[v.id]?.[campo] ?? (campo === 'precio' ? Number(v.precio).toFixed(2) : v[campo])
  const cambiar = (v, campo, nuevo) => setEdiciones((e) => ({ ...e, [v.id]: { ...e[v.id], [campo]: nuevo } }))
  const modificada = (v) =>
    ediciones[v.id] &&
    (valor(v, 'sku') !== v.sku || Number(String(valor(v, 'precio')).replace(',', '.')) !== Number(v.precio))
  const invalida = (v) =>
    !PATRON_SKU.test(String(valor(v, 'sku')).trim()) || !PATRON_PRECIO.test(String(valor(v, 'precio')).trim())

  const guardarVariante = (v) => {
    if (invalida(v)) return
    setGuardando(v.id)
    productosService
      .actualizar(v.id, {
        sku: String(valor(v, 'sku')).trim(),
        precio: Number(String(valor(v, 'precio')).replace(',', '.')).toFixed(2),
      })
      .then(() => {
        setEdiciones((e) => {
          const resto = { ...e }
          delete resto[v.id]
          return resto
        })
        toast.exito('Variante actualizada')
        onCambio()
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setGuardando(null))
  }

  const pedirFoto = (colorId) => {
    colorDeFoto.current = colorId
    entradaFoto.current?.click()
  }

  const subirFotoDeColor = async (archivoElegido) => {
    const colorId = colorDeFoto.current
    const archivo = archivoElegido ? prepararImagen(archivoElegido) : null
    if (!archivo) return
    setSubiendoColor(colorId)
    try {
      // La foto es la misma para todas las tallas de un color.
      for (const v of porColor.get(colorId) ?? []) {
        await productosService.subirFoto(v.id, archivo)
      }
      toast.exito('Foto actualizada en todas las tallas de ese color')
      onCambio()
    } catch (e) {
      toast.error(e.status === 413 ? 'La imagen supera los 5 MB' : e.message)
    } finally {
      setSubiendoColor(null)
      if (entradaFoto.current) entradaFoto.current.value = ''
    }
  }

  const agregar = async () => {
    setAgregando(true)
    let creadas = 0
    try {
      for (const combinacion of combinacionesNuevas) {
        await modelosService.agregarVariante(modelo.id, combinacion)
        creadas++
      }
      toast.exito(`${creadas} ${creadas === 1 ? 'variante agregada' : 'variantes agregadas'}`)
      setColoresNuevos([])
      setTallasNuevas([])
    } catch (e) {
      toast.error(`Se agregaron ${creadas}; falló la siguiente: ${e.message}`)
    } finally {
      setAgregando(false)
      onCambio()
    }
  }

  const eliminar = () => {
    productosService
      .eliminar(aEliminar.id)
      .then(() => {
        toast.exito('Variante eliminada')
        setAEliminar(null)
        onCambio()
      })
      .catch((e) => setErrorEliminar(e.message))
  }

  return (
    <>
      <input
        ref={entradaFoto}
        type="file"
        accept={IMAGENES_ACEPTADAS}
        className="hidden"
        onChange={(e) => subirFotoDeColor(e.target.files?.[0])}
      />

      <div className="space-y-4">
        {[...porColor.entries()].map(([colorId, lista]) => {
          const conFoto = lista.find((v) => v.foto)
          return (
            <div key={colorId} className="overflow-hidden rounded-xl border border-outline-variant">
              <div className="flex items-center gap-3 bg-surface-container-low px-4 py-3">
                <Miniatura url={conFoto ? productosService.urlFoto(conFoto) : null} alt="" />
                <div className="flex-1">
                  <p className="font-semibold text-on-surface">
                    {colorId ? referencias.nombre('colores', colorId) : 'Sin color'}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {lista.length} {lista.length === 1 ? 'talla' : 'tallas'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secundario py-1.5 text-xs"
                  disabled={subiendoColor !== null}
                  onClick={() => pedirFoto(colorId)}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {subiendoColor === colorId ? 'progress_activity' : 'photo_camera'}
                  </span>
                  {subiendoColor === colorId ? 'Subiendo...' : conFoto ? 'Cambiar foto' : 'Subir foto'}
                </button>
              </div>
              <div className="tabla overflow-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Talla</th>
                      <th>SKU</th>
                      <th>Precio</th>
                      <th className="text-right">Stock</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((v) => {
                      const stock = stockPorProducto.get(v.id) ?? 0
                      return (
                        <tr key={v.id}>
                          <td className="font-semibold">{v.talla_id ? referencias.nombre('tallas', v.talla_id) : '—'}</td>
                          <td>
                            <input
                              className="campo w-36 py-1.5 font-mono text-xs"
                              value={valor(v, 'sku')}
                              onChange={(e) => cambiar(v, 'sku', e.target.value)}
                              aria-label="SKU"
                            />
                          </td>
                          <td>
                            <div className="relative w-32">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">
                                Bs
                              </span>
                              <input
                                className="campo py-1.5 pl-8 text-xs tabular-nums"
                                inputMode="decimal"
                                value={valor(v, 'precio')}
                                onChange={(e) => cambiar(v, 'precio', e.target.value)}
                                aria-label="Precio"
                              />
                            </div>
                          </td>
                          <td className="text-right tabular-nums">{stock}</td>
                          <td>
                            <div className="acciones-fila">
                              {modificada(v) && (
                                <button
                                  type="button"
                                  className="btn-primario px-3 py-1 text-xs"
                                  disabled={invalida(v) || guardando === v.id}
                                  onClick={() => guardarVariante(v)}
                                >
                                  {guardando === v.id ? 'Guardando...' : 'Guardar'}
                                </button>
                              )}
                              {puedeEliminar && (
                                <button
                                  type="button"
                                  className="btn-icono-peligro"
                                  title={stock > 0 ? 'Tiene stock: no se puede eliminar' : 'Eliminar variante'}
                                  disabled={stock > 0}
                                  onClick={() => {
                                    setErrorEliminar(null)
                                    setAEliminar(v)
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
              </div>
            </div>
          )
        })}

        <div className="rounded-xl border border-dashed border-outline-variant p-4">
          <p className="mb-3 text-sm font-semibold text-on-surface">Agregar variantes</p>
          <p className="etiqueta">Colores</p>
          <SelectorChips opciones={referencias.lista('colores')} seleccion={coloresNuevos} onCambiar={setColoresNuevos} />
          <p className="etiqueta mt-3">Tallas</p>
          <SelectorChips opciones={tallasOrdenadas} seleccion={tallasNuevas} onCambiar={setTallasNuevas} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-on-surface-variant">
              {coloresNuevos.length && tallasNuevas.length
                ? `${combinacionesNuevas.length} combinaciones nuevas (las que ya existen se omiten) a ${monedaBs(modelo.precio)}`
                : 'Elige colores y tallas: se crea una variante por cada combinación.'}
            </p>
            <button
              type="button"
              className="btn-primario shrink-0"
              disabled={combinacionesNuevas.length === 0 || agregando}
              onClick={agregar}
            >
              {agregando ? 'Agregando...' : `Agregar ${combinacionesNuevas.length || ''}`}
            </button>
          </div>
        </div>
      </div>

      {aEliminar && (
        <ModalConfirmacion
          titulo={`¿Eliminar la variante ${aEliminar.nombre}?`}
          mensaje="Solo se pueden eliminar variantes sin stock ni movimientos."
          error={errorEliminar}
          onConfirmar={eliminar}
          onCancelar={() => setAEliminar(null)}
        />
      )}
    </>
  )
}
