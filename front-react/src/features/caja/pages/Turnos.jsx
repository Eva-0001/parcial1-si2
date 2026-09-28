import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { cajaService } from '../services/caja.service'
import { claseDiferencia, nombreCompleto, numeroTurno } from '../caja.utils'
import { sucursalesService } from '@/features/sucursales/services/sucursales.service'
import { useAuth } from '@/core/stores/auth.store'
import Tabla from '@/shared/components/Tabla'
import { formatoFecha } from '@/shared/utils/formato'
import { monedaBs } from '@/shared/utils/moneda-bs'

export default function Turnos() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [turnos, setTurnos] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [filtros, setFiltros] = useState({ sucursal_id: '', desde: '', hasta: '' })

  const pedir = useCallback((f) => {
    Promise.all([cajaService.listarTurnos(f), sucursalesService.listar()])
      .then(([lista, sucs]) => {
        setTurnos(lista)
        setSucursales(sucs)
        setError(null)
        setCargando(false)
      })
      .catch((e) => {
        setError(e.message)
        setCargando(false)
      })
  }, [])

  useEffect(() => {
    pedir({})
  }, [pedir])

  const cambiar = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor }
    setFiltros(nuevos)
    setCargando(true)
    pedir(nuevos)
  }

  const cerrados = turnos.filter((t) => t.cerrado_en)
  const diferenciaTotal = cerrados.reduce((acc, t) => acc + Number(t.diferencia), 0)

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Turnos de caja</h1>
          <p className="text-sm text-on-surface-variant">
            {auth.esCajero ? 'Tus turnos y sus arqueos.' : 'Aperturas, cierres y arqueos de los cajeros.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {auth.esAdmin && (
            <div>
              <label className="etiqueta" htmlFor="f-sucursal">
                Sucursal
              </label>
              <select
                id="f-sucursal"
                className="campo w-52"
                value={filtros.sucursal_id}
                onChange={(e) => cambiar('sucursal_id', e.target.value)}
              >
                <option value="">Todas</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="etiqueta" htmlFor="f-desde">
              Desde
            </label>
            <input id="f-desde" type="date" className="campo" value={filtros.desde} onChange={(e) => cambiar('desde', e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="f-hasta">
              Hasta
            </label>
            <input id="f-hasta" type="date" className="campo" value={filtros.hasta} onChange={(e) => cambiar('hasta', e.target.value)} />
          </div>
        </div>
      </div>

      <Tabla
        cargando={cargando}
        error={error}
        vacio={turnos.length === 0}
        iconoVacio="point_of_sale"
        tituloVacio="No hay turnos"
        descripcionVacio="Cuando un cajero abra un turno aparecerá aquí."
        onReintentar={() => cambiar('sucursal_id', filtros.sucursal_id)}
        pie={
          <>
            <p>
              {turnos.length} {turnos.length === 1 ? 'turno' : 'turnos'}
            </p>
            {cerrados.length > 0 && (
              <p>
                Diferencia acumulada: <span className={claseDiferencia(diferenciaTotal.toFixed(2))}>{monedaBs(diferenciaTotal)}</span>
              </p>
            )}
          </>
        }
      >
        <table>
          <thead>
            <tr>
              <th>Turno</th>
              <th>Sucursal</th>
              <th>Cajero</th>
              <th>Apertura</th>
              <th>Cierre</th>
              <th className="text-right">Esperado</th>
              <th className="text-right">Contado</th>
              <th className="text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id} className="cursor-pointer" onClick={() => navigate(`/panel/turnos/${t.id}`)}>
                <td className="font-semibold text-primary">{numeroTurno(t.id)}</td>
                <td>{t.sucursal?.nombre ?? '—'}</td>
                <td>{nombreCompleto(t.cajero)}</td>
                <td className="tabular-nums text-on-surface-variant">{formatoFecha(t.abierto_en, 'dd/MM/yyyy HH:mm')}</td>
                <td className="tabular-nums text-on-surface-variant">
                  {t.cerrado_en ? formatoFecha(t.cerrado_en, 'dd/MM/yyyy HH:mm') : <span className="chip text-success">Abierto</span>}
                </td>
                <td className="text-right tabular-nums">{t.cerrado_en ? monedaBs(t.efectivo_esperado) : '—'}</td>
                <td className="text-right tabular-nums">{t.cerrado_en ? monedaBs(t.efectivo_contado) : '—'}</td>
                <td className="text-right">
                  {t.cerrado_en ? <span className={claseDiferencia(t.diferencia)}>{monedaBs(t.diferencia)}</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tabla>
    </div>
  )
}
