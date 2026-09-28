import { useEffect, useState } from 'react'
import { almacenesService } from '../services/almacenes.service'
import { TIPOS_MOVIMIENTO, etiquetaProducto } from '../almacenes.utils'
import { stockService } from '@/features/inventario/services/stock.service'
import { productosService } from '@/features/productos/services/productos.service'
import { useReferencias } from '@/core/stores/referencias.store'
import { toast } from '@/core/stores/toast.store'
import Modal from '@/shared/components/Modal'

/**
 * Registra un ingreso, un envío o una devolución. Las opciones de productos dependen
 * del tipo: todo el catálogo al ingresar, lo que hay en el almacén al enviar y lo
 * disponible en la sucursal al devolver.
 */
export default function ModalMovimientoAlmacen({ almacen, tipo, stockAlmacen, sucursales, onCerrar, onGuardado }) {
  const referencias = useReferencias()
  const info = TIPOS_MOVIMIENTO[tipo]
  const conSucursal = tipo !== 'ingreso'

  const [sucursalId, setSucursalId] = useState(conSucursal ? String(sucursales[0]?.id ?? '') : '')
  const [opciones, setOpciones] = useState([])
  const [cargandoOpciones, setCargandoOpciones] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [lineas, setLineas] = useState([])
  const [observacion, setObservacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    let pedido
    if (tipo === 'ingreso') {
      pedido = productosService.listar().then((lista) => lista.map((p) => ({ producto: p, maximo: null })))
    } else if (tipo === 'envio') {
      pedido = Promise.resolve(
        stockAlmacen.filter((s) => s.cantidad > 0).map((s) => ({ producto: s.producto, maximo: s.cantidad })),
      )
    } else if (sucursalId) {
      pedido = stockService
        .listar({ sucursal_id: Number(sucursalId) })
        .then((lista) =>
          lista
            .map((s) => ({ producto: s.producto, maximo: s.cantidad - s.cantidad_reservada }))
            .filter((o) => o.producto && o.maximo > 0),
        )
    } else {
      pedido = Promise.resolve([])
    }

    pedido
      .then((lista) => {
        if (!vigente) return
        setOpciones(lista.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, 'es')))
        setCargandoOpciones(false)
      })
      .catch((e) => {
        if (!vigente) return
        setError(e.message)
        setCargandoOpciones(false)
      })
    return () => {
      vigente = false
    }
  }, [tipo, sucursalId, stockAlmacen])

  const cambiarSucursal = (valor) => {
    setSucursalId(valor)
    if (tipo === 'devolucion') {
      setLineas([])
      setCargandoOpciones(true)
    }
  }

  const texto = busqueda.trim().toLowerCase()
  const elegibles = opciones
    .filter((o) => !lineas.some((l) => l.producto.id === o.producto.id))
    .filter((o) => !texto || etiquetaProducto(o.producto, referencias).toLowerCase().includes(texto))
    .slice(0, 8)

  const agregar = (opcion) => {
    setLineas((ls) => [...ls, { ...opcion, cantidad: '1' }])
    setBusqueda('')
  }

  const cambiarCantidad = (id, valor) =>
    setLineas((ls) => ls.map((l) => (l.producto.id === id ? { ...l, cantidad: valor.replace(/\D/g, '') } : l)))

  const quitar = (id) => setLineas((ls) => ls.filter((l) => l.producto.id !== id))

  const invalida = (l) => {
    const n = Number(l.cantidad)
    return !Number.isInteger(n) || n <= 0 || (l.maximo !== null && n > l.maximo)
  }
  const listo = lineas.length > 0 && !lineas.some(invalida) && (!conSucursal || sucursalId !== '')
  const unidades = lineas.reduce((acc, l) => acc + (Number(l.cantidad) || 0), 0)

  const guardar = () => {
    if (!listo || guardando) return
    setGuardando(true)
    setError(null)
    almacenesService
      .registrarMovimiento(almacen.id, {
        tipo,
        sucursal_id: conSucursal ? Number(sucursalId) : undefined,
        observacion: observacion.trim() || null,
        detalles: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: Number(l.cantidad) })),
      })
      .then(() => {
        toast.exito(`${info.etiqueta} registrado`)
        onGuardado()
      })
      .catch((e) => {
        setGuardando(false)
        setError(e.message)
      })
  }

  return (
    <Modal
      titulo={info.titulo}
      ancho="ancho"
      onCerrar={onCerrar}
      footer={
        <>
          <button type="button" className="btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="btn-primario" disabled={!listo || guardando} onClick={guardar}>
            {guardando ? 'Registrando...' : `Registrar (${unidades} u.)`}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-5 rounded-lg border-l-4 border-error bg-error/5 p-3 text-sm text-on-surface" role="alert">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div className="flex items-center gap-2 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[18px] text-primary">{info.icono}</span>
          {tipo === 'ingreso' && `Mercadería que entra a ${almacen.nombre}.`}
          {tipo === 'envio' && `Sale de ${almacen.nombre} y se suma al stock de la sucursal.`}
          {tipo === 'devolucion' && `Sale del stock disponible de la sucursal y vuelve a ${almacen.nombre}.`}
        </div>

        {conSucursal && (
          <div>
            <label className="etiqueta" htmlFor="mov-sucursal">
              {tipo === 'envio' ? 'Sucursal de destino' : 'Sucursal de origen'}
            </label>
            <select id="mov-sucursal" className="campo" value={sucursalId} onChange={(e) => cambiarSucursal(e.target.value)}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="etiqueta" htmlFor="mov-buscar">
            Agregar productos
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
              search
            </span>
            <input
              id="mov-buscar"
              type="search"
              className="campo pl-9"
              placeholder={cargandoOpciones ? 'Cargando productos...' : 'Busca por nombre, talla o color'}
              disabled={cargandoOpciones}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          {!cargandoOpciones && (
            <ul className="mt-2 divide-y divide-outline-variant rounded-lg border border-outline-variant">
              {elegibles.length === 0 ? (
                <li className="px-4 py-3 text-sm text-on-surface-variant">
                  {opciones.length === 0
                    ? tipo === 'envio'
                      ? 'El almacén no tiene stock para enviar.'
                      : 'No hay productos disponibles.'
                    : 'Sin coincidencias.'}
                </li>
              ) : (
                elegibles.map((o) => (
                  <li key={o.producto.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-surface-container-low"
                      onClick={() => agregar(o)}
                    >
                      <span className="truncate">{etiquetaProducto(o.producto, referencias)}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-on-surface-variant">
                        {o.maximo !== null && `${o.maximo} disp.`}
                        <span className="material-symbols-outlined text-[18px] text-primary">add_circle</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {lineas.length > 0 && (
          <div className="tabla overflow-auto rounded-lg border border-outline-variant">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="w-32">Cantidad</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.producto.id}>
                    <td>
                      {etiquetaProducto(l.producto, referencias)}
                      {l.maximo !== null && <span className="block text-xs text-on-surface-variant">Máximo {l.maximo}</span>}
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={invalida(l) ? 'campo campo-invalido py-1.5 tabular-nums' : 'campo py-1.5 tabular-nums'}
                        value={l.cantidad}
                        onChange={(e) => cambiarCantidad(l.producto.id, e.target.value)}
                        aria-label="Cantidad"
                      />
                    </td>
                    <td>
                      <button type="button" className="btn-icono-peligro" title="Quitar" onClick={() => quitar(l.producto.id)}>
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <label className="etiqueta" htmlFor="mov-obs">
            Observación <span className="font-normal normal-case">(opcional)</span>
          </label>
          <input
            id="mov-obs"
            type="text"
            maxLength={500}
            className="campo"
            placeholder={tipo === 'ingreso' ? 'Ej. Factura 1234 del proveedor' : 'Ej. Reposición de temporada'}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
