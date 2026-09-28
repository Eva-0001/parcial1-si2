import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { enviosService } from '../services/envios.service'
import { ESTADO_ENVIO, ETIQUETA_METODO_PAGO, ETIQUETA_MODALIDAD, estadoDePago, qrPorVerificar } from '../envios.utils'
import { sucursalesService } from '@/features/sucursales/services/sucursales.service'
import { numeroVenta } from '@/features/ventas/ventas.utils'
import { useAuth } from '@/core/stores/auth.store'
import Tabla from '@/shared/components/Tabla'
import { formatoFecha } from '@/shared/utils/formato'
import { monedaBs } from '@/shared/utils/moneda-bs'
import { cx } from '@/shared/utils/clases'

const VISTAS = [
  ['activos', 'Por despachar'],
  ['entregado', 'Entregados'],
  ['cancelado', 'Cancelados'],
  ['todos', 'Todos'],
]

export default function PedidosOnline() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [envios, setEnvios] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [filtros, setFiltros] = useState({ vista: 'activos', modalidad: '', sucursal_id: '' })

  const pedir = useCallback((f) => {
    const params = {
      modalidad: f.modalidad,
      sucursal_id: f.sucursal_id,
      ...(f.vista === 'activos' ? { activos: true } : f.vista === 'todos' ? {} : { estado: f.vista }),
    }
    Promise.all([enviosService.listar(params), sucursalesService.listar()])
      .then(([lista, sucs]) => {
        setEnvios(lista)
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
    pedir({ vista: 'activos', modalidad: '', sucursal_id: '' })
  }, [pedir])

  const cambiar = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor }
    setFiltros(nuevos)
    setCargando(true)
    pedir(nuevos)
  }

  const porCobrar = envios.filter(
    (e) => e.venta?.metodo_pago === 'contraentrega' && e.venta.estado_pago === 'pendiente' && e.estado !== 'cancelado',
  )
  const qrPendientes = envios.filter((e) => qrPorVerificar(e.venta) && e.estado !== 'cancelado').length

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Pedidos online</h1>
          <p className="text-sm text-on-surface-variant">Prepara, despacha y entrega los pedidos de la tienda en línea.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1 rounded-lg bg-surface-container-low p-1">
            {VISTAS.map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                className={cx(
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  filtros.vista === valor ? 'bg-surface-container-lowest text-primary shadow-card' : 'text-on-surface-variant',
                )}
                onClick={() => cambiar('vista', valor)}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <select
            className="campo w-44 py-2 text-sm"
            value={filtros.modalidad}
            onChange={(e) => cambiar('modalidad', e.target.value)}
            aria-label="Modalidad"
          >
            <option value="">Todas las entregas</option>
            <option value="domicilio">Envío a domicilio</option>
            <option value="retiro">Retiro en sucursal</option>
          </select>
          {auth.esAdmin && (
            <select
              className="campo w-52 py-2 text-sm"
              value={filtros.sucursal_id}
              onChange={(e) => cambiar('sucursal_id', e.target.value)}
              aria-label="Sucursal"
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <Tabla
        cargando={cargando}
        error={error}
        vacio={envios.length === 0}
        iconoVacio="local_shipping"
        tituloVacio={filtros.vista === 'activos' ? 'No hay pedidos por despachar' : 'Sin pedidos'}
        descripcionVacio="Los pedidos de la tienda en línea aparecen aquí apenas el cliente confirma la compra."
        onReintentar={() => cambiar('vista', filtros.vista)}
        pie={
          <>
            <p>
              {envios.length} {envios.length === 1 ? 'pedido' : 'pedidos'}
            </p>
            {qrPendientes > 0 && (
              <p className="font-semibold text-amber-700">
                {qrPendientes} {qrPendientes === 1 ? 'pago QR por verificar' : 'pagos QR por verificar'}
              </p>
            )}
            {porCobrar.length > 0 && (
              <p>
                Contraentrega por cobrar:{' '}
                <span className="font-semibold text-on-surface">
                  {monedaBs(porCobrar.reduce((acc, e) => acc + Number(e.venta.total), 0))}
                </span>
              </p>
            )}
          </>
        }
      >
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Entrega</th>
              <th>Pago</th>
              <th>Estado</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {envios.map((e) => {
              const v = e.venta
              const estado = ESTADO_ENVIO[e.estado]
              const pago = estadoDePago(v)
              return (
                <tr key={e.id} className="cursor-pointer" onClick={() => navigate(`/panel/pedidos/${e.id}`)}>
                  <td className="font-semibold text-primary">{numeroVenta(e.venta_id)}</td>
                  <td className="whitespace-nowrap tabular-nums text-on-surface-variant">
                    {formatoFecha(e.creado_en, 'dd/MM HH:mm')}
                  </td>
                  <td>{v?.usuario ? `${v.usuario.nombre} ${v.usuario.apellido}` : '—'}</td>
                  <td>
                    <p className="font-medium">{ETIQUETA_MODALIDAD[e.modalidad]}</p>
                    <p className="text-xs text-on-surface-variant">
                      {e.modalidad === 'domicilio' ? `${e.ciudad?.nombre ?? ''} · ${e.direccion}` : e.sucursal?.nombre}
                    </p>
                  </td>
                  <td>
                    <p>{v?.metodo_pago ? ETIQUETA_METODO_PAGO[v.metodo_pago] : '—'}</p>
                    {pago && (
                      <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', pago.chip)}>{pago.etiqueta}</span>
                    )}
                  </td>
                  <td>
                    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', estado.chip)}>
                      <span className="material-symbols-outlined text-[14px]">{estado.icono}</span>
                      {estado.etiqueta}
                    </span>
                  </td>
                  <td className="text-right font-semibold tabular-nums">{v ? monedaBs(v.total) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Tabla>
    </div>
  )
}
