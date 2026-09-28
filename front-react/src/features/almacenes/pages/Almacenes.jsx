import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { almacenesService } from '../services/almacenes.service'
import ModalAlmacen from '../components/ModalAlmacen'
import { ciudadesService } from '@/features/ciudades/services/ciudades.service'
import { useAuth } from '@/core/stores/auth.store'
import { toast } from '@/core/stores/toast.store'
import Tabla from '@/shared/components/Tabla'
import ModalConfirmacion from '@/shared/components/ModalConfirmacion'
import { formatoNumero } from '@/shared/utils/formato'

export default function Almacenes() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [almacenes, setAlmacenes] = useState([])
  const [ciudades, setCiudades] = useState([])

  const [enEdicion, setEnEdicion] = useState(undefined)
  const [aEliminar, setAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState(null)

  const pedir = useCallback(() => {
    Promise.all([almacenesService.listar(), ciudadesService.listar()])
      .then(([lista, listaCiudades]) => {
        setAlmacenes(lista)
        setCiudades(listaCiudades)
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

  const recargar = () => {
    setCargando(true)
    pedir()
  }

  const alGuardar = () => {
    setEnEdicion(undefined)
    recargar()
  }

  const eliminar = () => {
    const almacen = aEliminar
    if (!almacen) return
    setEliminando(true)
    almacenesService
      .eliminar(almacen.id)
      .then(() => {
        setAlmacenes((lista) => lista.filter((a) => a.id !== almacen.id))
        setEliminando(false)
        setAEliminar(null)
        toast.exito('Almacén eliminado')
      })
      .catch((e) => {
        setEliminando(false)
        setErrorEliminar(e.message)
      })
  }

  const unidades = almacenes.reduce((acc, a) => acc + a.unidades, 0)

  return (
    <>
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">Almacenes</h1>
            <p className="text-sm text-on-surface-variant">
              Stock central que abastece a las sucursales: ingresos, envíos y devoluciones.
            </p>
          </div>
          {auth.esAdmin && (
            <button type="button" className="btn-primario" onClick={() => setEnEdicion(null)}>
              <span className="material-symbols-outlined text-[18px]">add</span>
              Nuevo almacén
            </button>
          )}
        </div>

        <Tabla
          cargando={cargando}
          error={error}
          vacio={almacenes.length === 0}
          iconoVacio="warehouse"
          tituloVacio="No hay almacenes todavía"
          descripcionVacio="Crea un almacén para registrar la mercadería que llega y repartirla a las sucursales."
          textoAccionVacio={auth.esAdmin ? 'Nuevo almacén' : null}
          onAccionVacia={() => setEnEdicion(null)}
          onReintentar={recargar}
          pie={
            <p>
              {almacenes.length} {almacenes.length === 1 ? 'almacén' : 'almacenes'} · {formatoNumero(unidades)} unidades en total
            </p>
          }
        >
          <table>
            <thead>
              <tr>
                <th>Almacén</th>
                <th>Ciudad</th>
                <th>Dirección</th>
                <th className="text-right">Productos</th>
                <th className="text-right">Unidades</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {almacenes.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button
                      type="button"
                      className="flex items-center gap-3 text-left font-semibold hover:text-primary"
                      onClick={() => navigate(`/panel/almacenes/${a.id}`)}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-primary">
                        <span className="material-symbols-outlined text-[18px]">warehouse</span>
                      </span>
                      {a.nombre}
                    </button>
                  </td>
                  <td>{a.ciudad?.nombre ?? '—'}</td>
                  <td className="max-w-[240px] truncate text-on-surface-variant" title={a.ubicacion ?? ''}>
                    {a.ubicacion || '—'}
                  </td>
                  <td className="text-right tabular-nums">{a.productos}</td>
                  <td className="text-right font-semibold tabular-nums">{formatoNumero(a.unidades)}</td>
                  <td>
                    <div className="acciones-fila">
                      <button
                        type="button"
                        className="btn-icono"
                        title="Ver stock y movimientos"
                        onClick={() => navigate(`/panel/almacenes/${a.id}`)}
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                      {auth.esAdmin && (
                        <>
                          <button type="button" className="btn-icono" title="Editar" onClick={() => setEnEdicion(a)}>
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button
                            type="button"
                            className="btn-icono-peligro"
                            title="Eliminar"
                            onClick={() => {
                              setErrorEliminar(null)
                              setAEliminar(a)
                            }}
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tabla>
      </div>

      {enEdicion !== undefined && (
        <ModalAlmacen
          almacen={enEdicion}
          ciudades={ciudades}
          nombresOcupados={almacenes.map((a) => a.nombre)}
          onCerrar={() => setEnEdicion(undefined)}
          onGuardado={alGuardar}
        />
      )}

      {aEliminar && (
        <ModalConfirmacion
          titulo={`¿Eliminar ${aEliminar.nombre}?`}
          mensaje="Solo se puede eliminar un almacén que nunca tuvo movimientos."
          error={errorEliminar}
          cargando={eliminando}
          onConfirmar={eliminar}
          onCancelar={() => setAEliminar(null)}
        />
      )}
    </>
  )
}
